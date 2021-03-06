#!/usr/bin/env node
const cwd = process.cwd()
const pkg = require(`${cwd}/package`)
const commands = require(`${cwd}/${pkg.koapi.commands.path}`)
require('../lib').cli(commands, { default: pkg.koapi.commands.default })
