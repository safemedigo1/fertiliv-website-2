/**
 * Puppeteer configuration.
 * Set cache dir to /tmp so it works for any OS user (ubuntu or root).
 * In production the system Chromium at /usr/bin/chromium is used directly,
 * so this is only a fallback for the browser download path.
 */
const { join } = require("path");

/** @type {import("puppeteer").Configuration} */
module.exports = {
  cacheDirectory: join("/tmp", ".puppeteer-cache"),
};
