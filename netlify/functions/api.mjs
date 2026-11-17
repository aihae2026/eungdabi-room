import legacyApi from "./api-legacy.cjs";

export default async (request) => {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const body = ["GET", "HEAD"].includes(request.method) ? null : await request.text();
  const queryStringParameters = Object.fromEntries(url.searchParams.entries());

  const event = {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    headers,
    queryStringParameters,
    body,
    isBase64Encoded: false,
  };

  // AI 응답을 오래 기다리는 경로는 중간중간 진행 신호를 보내 게이트웨이 시간 제한에 끊기지 않게 한다.
  const STREAMED_POST_PATHS = ["/api/checklist-templates/ai-file-draft", "/api/analysis/report", "/api/analysis/recommend"];
  if (request.method === "POST" && STREAMED_POST_PATHS.includes(url.pathname)) {
    return streamLegacyResponse(legacyApi.handler(event));
  }

  const result = await legacyApi.handler(event);

  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
};

function streamLegacyResponse(resultPromise) {
  const encoder = new TextEncoder();
  const encodeEvent = (event) => encoder.encode(`${JSON.stringify(event)}\n`);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encodeEvent({ type: "started" }));
      const keepAlive = setInterval(
        () => controller.enqueue(encodeEvent({ type: "progress", at: Date.now() })),
        8000
      );

      resultPromise
        .then((result) => {
          clearInterval(keepAlive);
          let payload = {};
          try {
            payload = JSON.parse(result.body || "{}");
          } catch {
            payload = { message: "응답 내용을 처리하지 못했습니다." };
          }
          if (result.statusCode >= 400) {
            controller.enqueue(
              encodeEvent({
                type: "error",
                payload: {
                  ...payload,
                  streamedError: true,
                  statusCode: result.statusCode,
                },
              })
            );
          } else {
            controller.enqueue(encodeEvent({ type: "result", payload }));
          }
          controller.close();
        })
        .catch((error) => {
          clearInterval(keepAlive);
          controller.enqueue(
            encodeEvent({
              type: "error",
              payload: {
                streamedError: true,
                statusCode: 500,
                message: error?.message || "요청을 처리하지 못했습니다.",
              },
            })
          );
          controller.close();
        });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...legacyApi.corsHeaders(Netlify.env.get("ALLOWED_ORIGIN") || ""),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const config = {
  path: "/api/*",
};
