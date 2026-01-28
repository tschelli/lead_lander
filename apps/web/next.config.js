const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure monorepo root files (configs) are bundled in server output.
  outputFileTracingRoot: path.join(__dirname, "..", "..")
};

module.exports = nextConfig;
