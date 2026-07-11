# Bun HTTP request scopes

Create the application container once, then create and dispose one child for
each request. Request-local values are borrowed; request-created class and
factory resources are owned by the child.

```ts
import { Container, Service, token } from "bunject";

const REQUEST = token<Request>("REQUEST");

@Service({ inject: [REQUEST], scope: "scoped" })
class RequestContext {
  constructor(readonly request: Request) {}
}

@Service({ inject: [RequestContext] })
class RequestHandler {
  constructor(readonly context: RequestContext) {}

  response() {
    return Response.json({ path: new URL(this.context.request.url).pathname });
  }
}

const application = new Container();
application.register(RequestContext);
application.register(RequestHandler);
application.validate(RequestHandler);

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

If request cleanup is synchronous, `using` is sufficient. Prefer
`await using` when a request graph may contain `Symbol.asyncDispose`, an async
factory, or an in-flight resource.
