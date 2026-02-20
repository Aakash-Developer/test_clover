/**
 * App config and Clover API client.
 * Single place for env vars and the axios instance used for Clover REST API.
 */

require('dotenv').config();
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
const ACCESS_TOKEN = process.env.CLOVER_ACCESS_TOKEN;
const CLOVER_BASE_URL = process.env.CLOVER_BASE_URL || 'https://api.clover.com';

/** Axios instance for Clover REST API (v3). */
const clover = axios.create({
  baseURL: CLOVER_BASE_URL,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

function hasCloverConfig() {
  return Boolean(MERCHANT_ID && ACCESS_TOKEN);
}

module.exports = {
  PORT,
  MERCHANT_ID,
  ACCESS_TOKEN,
  CLOVER_BASE_URL,
  clover,
  hasCloverConfig,
};
