const path = require("path");

function devServerV5(config) {
  const { https, onAfterSetupMiddleware, onBeforeSetupMiddleware, setupMiddlewares, ...rest } = config;
  rest.server = typeof https === "object" ? { type: "https", options: https } : https ? "https" : "http";
  rest.setupMiddlewares = (middlewares, server) => {
    onBeforeSetupMiddleware?.(server);
    const result = setupMiddlewares ? setupMiddlewares(middlewares, server) : middlewares;
    onAfterSetupMiddleware?.(server);
    return result;
  };
  return rest;
}

module.exports = {
  jest: { configure: { moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" } } },
  webpack: { alias: { "@": path.resolve(__dirname, "src") } },
  devServer: devServerV5,
};
