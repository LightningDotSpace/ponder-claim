export const openApiSchema = {
  openapi: "3.0.0",
  info: {
    title: "Ponder Claim API",
    version: "1.0.0",
    description: "API for managing coin swap claims",
  },
  servers: [
    {
      url: "http://localhost:42069",
      description: "Development server",
    },
  ],
  paths: {
    "/check-preimagehash": {
      get: {
        summary: "Check preimage hash",
        description: "Check if a lockup exists for a given preimage hash",
        parameters: [
          {
            name: "preimageHash",
            in: "query",
            required: true,
            schema: {
              type: "string",
            },
            description: "The preimage hash to check",
          },
        ],
        responses: {
          "200": {
            description: "Lockup found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    lockup: {
                      type: "object",
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Bad request - preimage hash is required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Lockup not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/help-me-claim": {
      post: {
        summary: "Claim a lockup",
        description: "Execute a claim transaction for a lockup",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["preimageHash", "preimage"],
                properties: {
                  preimageHash: {
                    type: "string",
                    description: "The preimage hash",
                  },
                  preimage: {
                    type: "string",
                    description: "The preimage",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Claim successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    txHash: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Bad request",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Lockup not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    details: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/wallet": {
      get: {
        summary: "Get wallet information",
        description: "Get the address and balance of the configured wallet",
        responses: {
          "200": {
            description: "Wallet information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    address: { type: "string" },
                    balance: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

