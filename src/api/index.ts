import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { swaggerUI } from "@hono/swagger-ui";
import { openApiSchema } from "./openapi";
import routes from "./routes";
import refundRoutes from "./refundRoutes";

const app = new Hono();

app.get("/swagger", swaggerUI({ url: "/swagger.json" }));
app.get("/swagger.json", (c) => c.json(openApiSchema));

app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.route("/", routes);
app.route("/", refundRoutes);

export default app;
