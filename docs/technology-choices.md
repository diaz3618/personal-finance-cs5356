# Technology choices

This document explains why each component in `pf-tracker` was picked for the project and what problem it solves in the current design. Each choice supports a specific part of the system: data integrity, authenticated access, deployment structure, or repeatable development.

## Design priorities

The project was built around four priorities:

- keep data rules close to the database when they are naturally relational
- separate authentication concerns from transaction and reporting logic
- make the stack easy to run locally and straightforward to deploy in a more formal environment
- use components that expose clear technical trade-offs rather than hiding core behavior behind large abstractions

Those priorities explain most of the stack.

## MySQL

MySQL is the center of the project, not just a persistence layer. The schema uses foreign keys, unique constraints, checks, triggers, views, stored procedures, functions, events, window queries, and common table expressions. That matters because the project is trying to show how relational features can enforce correctness and support reporting directly in the database.

A document store or a lighter embedded database would have made the application easier to bootstrap, but it would also have weakened the parts of the project that depend on declarative constraints and server-side SQL programming. MySQL was a reasonable fit because it supports the advanced SQL features already used in `database/init/01-schema.sql`, runs cleanly in both Docker Compose and Kubernetes, and is familiar enough that the design choices remain easy to inspect.

## Database-centric logic

The project keeps a large share of its business logic in MySQL because the rules being enforced are relational in nature. Category ownership, transaction type validation, budget uniqueness, audit capture, and row filtering all map directly to database objects. Putting those checks in the schema means the same rules apply no matter which route reaches the data.

This is why the Express layer stays thin. It validates requests and manages request context, but it does not attempt to duplicate the integrity rules that already belong in the database.

## Node.js and Express

Node.js and Express provide a small application layer that is easy to inspect. The server code in `app/server.js` is mostly routing, middleware, and database calls. That keeps attention on the data model and the SQL behavior instead of burying the project under framework-specific patterns.

Express is a good fit here because the API surface is modest, the middleware model is simple, and the project benefits from direct control over how Clerk, Redis, MySQL, and raw webhook payloads are wired together. A larger framework could have provided more scaffolding, but that scaffolding would not have added much to the core database work this project is built around.

## Clerk

Clerk handles user identity, session validation, and webhook-based user provisioning. That separation is useful in this project because it keeps credential storage and token verification out of the application code while still letting the database work with a local `users` table.

The important design point is that Clerk is not used as a replacement for the database user model. Instead, it supplies an external identity that is mapped to an internal row. That gives the application a stable bridge between modern authentication and relational authorization. The result is a cleaner division of labor: Clerk proves who the user is, and MySQL decides which rows that user
may touch.

## Redis

Redis is used for one narrow purpose: caching the mapping from Clerk user id to local `users.id`. That lookup happens in the authenticated request path, so it is a good candidate for a small cache.

Redis was not added as a general data store, queue, or session backend. In this project, it solves a focused latency and repetition problem. Without it, the application would need an extra MySQL lookup on every authenticated request, even when the identity-to-row mapping is stable. Adding Redis shows a measured use of caching instead of a speculative one.

## Nginx

Nginx gives the stack a clean boundary between public traffic and the application process. It serves the static frontend, proxies API requests, handles webhook forwarding, and centralizes the HTTP entry point for both local and clustered deployments.

That is useful even for a small project because it mirrors a more realistic deployment shape. The Node process does not need to be exposed directly, and the static assets do not need to be served by the same runtime that handles API requests. Nginx makes that separation explicit.

## Ngrok

Clerk webhooks need a reachable public endpoint during local development. ngrok solves that problem with minimal setup. It is included as a development overlay, not as a permanent production dependency.

The value of ngrok in this project is practical: webhook flows can be tested against the real authentication provider without inventing a second local-only path. That keeps the provisioning flow closer to the deployed behavior.

## Docker Compose

Docker Compose is the most direct way to run the full stack locally. It starts MySQL, Redis, the Express app, and Nginx with a single command and keeps the service wiring reproducible across machines.

That matters because the project is multi-service. Running each component by hand would make setup more fragile and would distract from the actual system behavior. Compose gives the project a consistent local environment while still keeping the configuration readable.

## Kubernetes

Kubernetes is not required to make the project run, but it is useful as the cluster-oriented deployment target. The manifests show how the same services can be expressed with namespaces, config maps, secrets, probes, services, ingress, and persistent storage.

For this project, Kubernetes is less about scale in the current workload and more about deployment structure. It demonstrates how the application could be packaged for a more formal environment without changing the core design.

## Static HTML, CSS, and browser-side JavaScript

The frontend is intentionally simple. Static pages and browser-side JavaScript keep the interface readable and avoid shifting the project toward frontend framework concerns. That leaves more space for the database design, reporting logic, and request flow to be the technical focus.

This was a deliberate trade-off. A heavier frontend stack could have added more client-side structure, but the project did not need that complexity to show the data and API behavior it was built to demonstrate.

## Supporting libraries

The supporting libraries are narrow and predictable:

- `mysql2` provides promise-based MySQL access with pooling, which matches the split between `adminPool` and `appPool`
- `ioredis` provides a stable Redis client without adding its own application framework
- `svix` verifies Clerk webhook signatures correctly against the raw request body
- `cors` keeps browser access explicit instead of relying on permissive default behavior
- `dotenv` keeps local configuration outside the codebase

None of these libraries define the architecture. They support it.

## Why this stack fits the project

Taken together, the stack supports the main technical argument of the project: relational design, integrity enforcement, advanced SQL, and row-scoped access control can stay at the center of an application even when that application is integrated with modern authentication, caching, and containerized deployment.

That is why the project does not treat MySQL as interchangeable with every other component. The database is the design anchor, and the rest of the stack exists to expose, protect, and deploy that design cleanly.
