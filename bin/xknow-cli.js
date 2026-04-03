#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { expandHome, getOpenClawApiKey, getOpenClawModel } from '../lib/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

// Config path
const CONFIG_PATH = path.join(os.homedir(), '.xknow-clirc');

// Default paths
const DEFAULT_WIKI_PATH = '~/Obsidian/Xknow-Wiki';
const DEFAULT_RAW_PATH = '~/Obsidian/Xknow-Wiki/raw';

/**
 * Load configuration
 */
function loadConfig() {
  let config = {
    wikiPath: DEFAULT_WIKI_PATH,
    rawPath: DEFAULT_RAW_PATH,
    llmProvider: 'auto',
    llmModel: 'auto',
    apiKey: null
  };

  // 1. Load file config
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = { ...config, ...fileConfig };
    } catch (e) {
      console.error(chalk.yellow('⚠ Failed to parse config file, using defaults.'));
    }
  }

  // 2. Automatically get LLM config from OpenClaw
  if (config.llmProvider === 'auto' || config.llmModel === 'auto') {
    const openaiKey = getOpenClawApiKey();
    const model = getOpenClawModel();

    if (openaiKey) config.apiKey = openaiKey;
    if (model) config.llmModel = model;
    config.llmProvider = 'openai';
  }

  return config;
}

/**
 * Save configuration
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Check if Obsidian CLI is available
 */
function checkObsidianCli() {
  try {
    const result = execSync('obsidian --version', { encoding: 'utf8' });
    return { available: true, version: result.trim() };
  } catch (e) {
    return { available: false, version: null };
  }
}

/**
 * Ensure Obsidian Vault exists
 */
function ensureObsidianVault(vaultPath) {
  const expanded = expandHome(vaultPath);
  
  if (!fs.existsSync(expanded)) {
    console.log(chalk.cyan(`\n📁 Creating Obsidian Vault: ${expanded}`));
    fs.mkdirSync(expanded, { recursive: true });
    
    // Create base directory structure
    const dirs = ['raw/articles', 'raw/papers', 'raw/repos', 'raw/notes'];
    for (const d of dirs) {
      fs.mkdirSync(path.join(expanded, d), { recursive: true });
    }
    
    // Create wiki index
    const indexContent = `# Xknow Wiki\n\n## Table of Contents\n\n- [[INDEX]]\n\n--- \n*Managed by Xknow-CLI*\n`;
    fs.writeFileSync(path.join(expanded, 'INDEX.md'), indexContent);
    
    console.log(chalk.green('✅ Obsidian Vault created successfully!'));
    console.log(chalk.gray(`   Please open it in Obsidian: ${expanded}`));
    
    const obsidianCli = checkObsidianCli();
    if (obsidianCli.available) {
      try {
        console.log(chalk.gray('\n   Trying to open with Obsidian CLI...'));
        execSync(`obsidian open "${expanded}"`);
      } catch (e) {
        // Ignore
      }
    }
    
    return true;
  }
  
  console.log(chalk.green(`\n✅ Obsidian Vault already exists: ${expanded}`));
  return false;
}

program
  .name('xknow-cli')
  .description('Xknow-CLI - AI-First Knowledge Management Tool for OpenClaw Users, based on Karpathy LLM Knowledge Bases concept')
  .version(pkg.version);

// config command
program
  .command('config')
  .description('Configure or view current settings')
  .option('-w, --wiki <path>', 'Path to Wiki directory')
  .option('-r, --raw <path>', 'Path to Raw data directory')
  .option('-l, --list', 'List current configuration')
  .option('--init', 'Initialize Obsidian Vault')
  .action((options) => {
    const config = loadConfig();

    if (options.list) {
      const obsidianCli = checkObsidianCli();
      const openClawPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const hasOpenClaw = fs.existsSync(openClawPath);

      console.log(chalk.bold.green('\n🛠 Current Configuration:'));
      console.log(chalk.gray('--------------------------------'));
      console.log(`${chalk.yellow('Wiki Path:  ')} ${expandHome(config.wikiPath)}`);
      console.log(`${chalk.yellow('Raw Path:   ')} ${expandHome(config.rawPath)}`);
      console.log(`${chalk.yellow('LLM:        ')} ${config.llmProvider} / ${config.llmModel}`);
      console.log(`${chalk.yellow('API Key:   ')} ${config.apiKey ? '****' + config.apiKey.slice(-4) : (hasOpenClaw ? chalk.green('Auto-loaded from OpenClaw') : chalk.red('Not Found'))}`);
      console.log(chalk.gray('--------------------------------'));
      console.log(`${chalk.yellow('OpenClaw:   ')} ${hasOpenClaw ? chalk.green('Found (' + openClawPath + ')') : chalk.yellow('Not found (manual setup required via env vars)')}`);
      console.log(`${chalk.yellow('Obsidian:   ')} ${obsidianCli.available ? chalk.green('✓ CLI available v' + obsidianCli.version) : chalk.red('✗ CLI not available')}`);
      console.log(chalk.gray('--------------------------------\n'));
      
      if (!hasOpenClaw && !process.env.OPENAI_API_KEY) {
        console.log(chalk.yellow('💡 To set up manually, export environment variables:'));
        console.log(chalk.gray('   export OPENAI_API_KEY=your_key'));
        console.log(chalk.gray('   export OPENAI_BASE_URL=https://...'));
        console.log(chalk.gray('   export OPENAI_MODEL=gpt-4o\n'));
      }
      return;
    }

    if (options.init) {
      ensureObsidianVault(config.wikiPath);
      return;
    }

    if (options.wiki) config.wikiPath = options.wiki;
    if (options.raw) config.rawPath = options.raw;

    saveConfig(config);
    console.log(chalk.green('✔ Configuration updated:'));
    console.log(chalk.cyan(`  Wiki Path: ${config.wikiPath}`));
    console.log(chalk.cyan(`  Raw Path: ${config.rawPath}`));
  });

// ingest command
program
  .command('ingest')
  .description('Ingest source content to raw/')
  .argument('<source>', 'Source URL or local file path')
  .option('-c, --category <category>', 'Category (articles|papers|notes|repos)', 'notes')
  .action(async (source, options) => {
    const config = loadConfig();
    const { ingest } = await import('../lib/ingest.js');
    await ingest(config, source, options);
  });

// compile command
program
  .command('compile')
  .description('Compile raw data into wiki pages (Dual-Layer: Refs & Concepts)')
  .option('-s, --source <source>', 'Specify source category')
  .option('-f, --force', 'Force recompile all files')
  .action(async (options) => {
    const config = loadConfig();
    const { compile } = await import('../lib/compile.js');
    await compile(config, options);
  });

// query command
program
  .command('query')
  .description('Intelligent Q&A based on wiki context')
  .argument('<question>', 'Question to ask')
  .option('-f, --format <format>', 'Output format (markdown|slides|mermaid)', 'markdown')
  .option('-s, --save', 'Save the result as a new concept article')
  .action(async (question, options) => {
    const config = loadConfig();
    const { query } = await import('../lib/query.js');
    await query(config, question, options);
  });

// lint command
program
  .command('lint')
  .description('AI Librarian Health Check & Gap Analysis')
  .action(async () => {
    const config = loadConfig();
    const { lint } = await import('../lib/lint.js');
    await lint(config);
  });

// doctor command
program
  .command('doctor')
  .description('Diagnose environment and configuration')
  .action(async () => {
    const config = loadConfig();
    const { doctor } = await import('../lib/doctor.js');
    await doctor(config);
  });

// init command
program
  .command('init')
  .description('Initialize Obsidian Vault')
  .option('-f, --force', 'Force re-create')
  .action(async (options) => {
    const config = loadConfig();
    if (options.force) {
      console.log(chalk.yellow('\n⚠ Force re-creating (existing data will be kept but structure verified)!'));
    }
    ensureObsidianVault(config.wikiPath);
  });

program.parse(process.argv);
