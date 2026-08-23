import { RemoveBgProvider } from "@/lib/product/providers/removeBgProvider"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

const originalFetch = global.fetch

function mockFetchOnce(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  let capturedUrl: string | null = null
  let capturedInit: RequestInit | null = null
  global.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url
    capturedInit = init
    return impl(url, init)
  }) as typeof fetch
  return { getCaptured: () => ({ url: capturedUrl, init: capturedInit }) }
}

async function run() {
  console.log("=== CASE 1: Correct source passed, correct operation, no credential in result ===")
  {
    const mock = mockFetchOnce(() => new Response(new Uint8Array([137, 80, 78, 71]).buffer, {
      status: 200,
      headers: { "X-Request-Id": "req-123" },
    }))
    const provider = new RemoveBgProvider("fake-test-key-never-real")
    const result = await provider.improve({
      sourceImageUrl: "https://example.com/signed-source.jpg",
      operation: "BACKGROUND_REMOVAL",
      preserveProductIdentity: true,
    })
    const { url, init } = mock.getCaptured()
    assert(url === "https://api.remove.bg/v1.0/removebg", `correct endpoint called (got ${url})`)
    assert((init?.headers as Record<string, string>)?.["X-Api-Key"] === "fake-test-key-never-real", "API key sent as header, not in body/URL")
    assert(result.success === true, "result reports success")
    assert(result.providerMetadata?.provider === "remove.bg", "provider metadata correctly identifies remove.bg")
    assert(result.providerMetadata?.providerRequestId === "req-123", "safe provider request ID captured")
    assert(JSON.stringify(result).includes("fake-test-key-never-real") === false, "API key never appears anywhere in the returned result")
  }

  console.log("\n=== CASE 2: Credential never logged even on failure ===")
  {
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => { if (JSON.stringify(args).includes("fake-test-key-never-real")) { throw new Error("CREDENTIAL LEAKED IN LOG") } }
    mockFetchOnce(() => new Response("Unauthorized", { status: 401 }))
    const provider = new RemoveBgProvider("fake-test-key-never-real")
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    console.error = originalConsoleError
    assert(result.success === false, "401 correctly reported as failure")
    assert(result.error === "AI image improvement is not currently available.", `customer-safe error message (got "${result.error}")`)
    assert(!JSON.stringify(result).includes("fake-test-key-never-real"), "credential absent from error result")
  }

  console.log("\n=== CASE 3: Safe provider response handled - rate limit ===")
  {
    mockFetchOnce(() => new Response("Too Many Requests", { status: 429 }))
    const provider = new RemoveBgProvider("fake-key")
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    assert(result.success === false, "429 correctly reported as failure")
    assert(result.error?.includes("busy") ?? false, "customer-friendly rate-limit message")
  }

  console.log("\n=== CASE 4: Safe provider response handled - bad image ===")
  {
    mockFetchOnce(() => new Response("Bad image", { status: 400 }))
    const provider = new RemoveBgProvider("fake-key")
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    assert(result.success === false, "400 correctly reported as failure")
    assert(result.error?.includes("clearer product image") ?? false, "customer-friendly image-quality message")
  }

  console.log("\n=== CASE 5: Network failure handled safely, never throws ===")
  {
    global.fetch = (async () => { throw new Error("ECONNREFUSED - internal network detail") }) as typeof fetch
    const provider = new RemoveBgProvider("fake-key")
    let threw = false
    let result
    try {
      result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    } catch {
      threw = true
    }
    assert(threw === false, "network failure does not throw/crash the caller")
    assert(result?.success === false, "network failure reported as unsuccessful result")
    assert(!(result?.error ?? "").includes("ECONNREFUSED"), "raw network error internals not leaked to customer")
  }

  console.log("\n=== CASE 6: Missing API key -> zero network calls attempted ===")
  {
    let fetchCallCount = 0
    global.fetch = (async () => { fetchCallCount++; return new Response("", { status: 200 }) }) as typeof fetch
    const provider = new RemoveBgProvider(undefined)
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    assert(fetchCallCount === 0, `zero provider calls made when unconfigured (got ${fetchCallCount})`)
    assert(result.success === false, "missing configuration reported as failure, not silently succeeding")
  }

  console.log("\n=== CASE 7: Empty response body treated as failure, not silently accepted ===")
  {
    mockFetchOnce(() => new Response(new ArrayBuffer(0), { status: 200 }))
    const provider = new RemoveBgProvider("fake-key")
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "BACKGROUND_REMOVAL", preserveProductIdentity: true })
    assert(result.success === false, "empty result body is honestly treated as failure")
  }

  console.log("\n=== CASE 8: Unsupported operation rejected before any network call ===")
  {
    let fetchCallCount = 0
    global.fetch = (async () => { fetchCallCount++; return new Response("", { status: 200 }) }) as typeof fetch
    const provider = new RemoveBgProvider("fake-key")
    // @ts-expect-error - intentionally testing an invalid operation value
    const result = await provider.improve({ sourceImageUrl: "https://example.com/x.jpg", operation: "SOMETHING_ELSE", preserveProductIdentity: true })
    assert(fetchCallCount === 0, "no network call for an unsupported operation")
    assert(result.success === false, "unsupported operation correctly rejected")
  }

  global.fetch = originalFetch
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) { process.exit(1) }
}

run()
