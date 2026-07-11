# Bun HTTP request scopes

Create the application container once, then create and dispose one child for
each request. Request-local values are borrowed; request-created class and
factory resources are owned by the child.

The canonical [executable example](../examples/bun-http.ts) is compiled and
exercised by `bun run example:check` as part of the main merge gate.

```ts
import { Container, Injectable, token } from "bunject";

const REQUEST = token<Request>("REQUEST");

@Injectable({ inject: [REQUEST], scope: "scoped" })
class RequestContext {
  constructor(readonly request: Request) {}
}

@Injectable({ inject: [RequestContext] })
class RequestHandler {
  constructor(readonly context: RequestContext) {}

  response() {
    return Response.json({ path: new URL(this.context.request.url).pathname });
  }
}

const application = new Container();
application.register(RequestContext);
application.register(RequestHandler);
Bun.serve({
  async fetch(request) {
    await using scope = application.createScope();
    scope.register(REQUEST, { useValue: request });
    return scope.resolve(RequestHandler).response();
  },
});
```

Do not register `Request` on the root. A singleton also cannot inject
`RequestContext`; captive-dependency validation rejects that graph before the
singleton is constructed. Put request-dependent services in `scoped`,
`resolution`, or `transient` lifetimes.

Validate this root in an integration test after registering a sample `REQUEST`
on a child scope; validating it on the application root correctly reports the
missing request-local token.

If request cleanup is synchronous, `using` is sufficient. Prefer
`await using` when a request graph may contain `Symbol.asyncDispose`, an async
factory, or an in-flight resource.
