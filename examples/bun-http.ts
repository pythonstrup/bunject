import { Container, Injectable, token } from "bunject";

const REQUEST = token<Request>("REQUEST");

@Injectable({ inject: [REQUEST], scope: "scoped" })
class RequestContext {
  constructor(readonly request: Request) {}
}

@Injectable({ inject: [RequestContext] })
class RequestHandler {
  constructor(readonly context: RequestContext) {}

  response(): Response {
    return Response.json({ path: new URL(this.context.request.url).pathname });
  }
}

export const application = new Container();
application.register(RequestContext);
application.register(RequestHandler);

export async function handle(request: Request): Promise<Response> {
  await using scope = application.createScope();
  scope.register(REQUEST, { useValue: request });
  return scope.resolve(RequestHandler).response();
}

export function serve() {
  return Bun.serve({ fetch: handle });
}

if (import.meta.main) {
  const response = await handle(new Request("http://localhost/health"));
  const body = await response.json() as { path?: unknown };
  if (body.path !== "/health") throw new Error("Bun HTTP example failed");
  await application.disposeAsync();
}
