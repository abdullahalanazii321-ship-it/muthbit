'use strict';
const knexFactory = require('knex');
const config = require('../../knexfile');
const env = require('../config/env');

const db = knexFactory(config[env.env] || config.development);

module.exports = db;
