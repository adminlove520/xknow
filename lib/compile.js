// lib/compile.js - Compile raw data into a Dual-Layer Wiki

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globby } from 'globby';
import { callLLM, PROMPTS } from './llm.js';
import { expandHome } from './config.js';

const HISTORY_FILE = '.xknow-history.json';

/**
 * Compile raw data into dual-layer wiki (Refs & Concepts)
 */
export async function compile(config, options = {}) {
  const spinner = ora(chalk.cyan('Starting Dual-Layer compilation...')).start();

  try {
    const rawDir = expandHome(config.rawPath);
    const wikiDir = expandHome(config.wikiPath);
    const refsDir = path.join(wikiDir, 'refs');
    const conceptsDir = path.join(wikiDir, 'concepts');

    // LLM config overrides from CLI
    const llmOptions = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      apiType: options.apiType
    };

    [wikiDir, refsDir, conceptsDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    const history = loadHistory(wikiDir);
    const force = options.force || false;

    // 1. Compile References (Source per Source)
    spinner.text = chalk.cyan('Step 1: Compiling Reference articles (Librarian mode)...');
    const sourceTypes = ['articles', 'papers', 'notes', 'repos'];
    let refCompiled = 0;
    const newRefFiles = [];

    for (const type of sourceTypes) {
      const typeRawDir = path.join(rawDir, type);
      if (!fs.existsSync(typeRawDir)) continue;

      const files = await globby(['**/*.md', '**/*.txt'], { cwd: typeRawDir });
      
      for (const file of files) {
        const filePath = path.join(typeRawDir, file);
        const fileHash = getHash(filePath);
        
        const historyKey = `${type}/${file}`;
        if (!force && history[historyKey] === fileHash) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        
        // Call LLM for Reference compilation
        const refContent = await callLLM([
          { role: 'system', content: PROMPTS.COMPILE_REFERENCE },
          { role: 'user', content: `Source type: ${type}\nFilename: ${file}\n\nContent:\n${content}` }
        ], llmOptions);

        const refFile = path.join(refsDir, type, file.replace(/\.(md|txt)$/, '.md'));
        if (!fs.existsSync(path.dirname(refFile))) fs.mkdirSync(path.dirname(refFile), { recursive: true });

        fs.writeFileSync(refFile, refContent);
        history[historyKey] = fileHash;
        refCompiled++;
        newRefFiles.push({ type, file, content: refContent });
      }
    }

    // 2. Synthesize Concepts (Knowledge Architecture)
    if (newRefFiles.length > 0 || force) {
      spinner.text = chalk.cyan('Step 2: Synthesizing Concept articles (Architect mode)...');
      
      const synthesisContext = newRefFiles.map(r => `Ref [${r.type}/${r.file}]:\n${r.content.substring(0, 500)}...`).join('\n\n');
      
      const conceptContent = await callLLM([
        { role: 'system', content: PROMPTS.COMPILE_CONCEPT },
        { role: 'user', content: `Analyze these new references and synthesize into concept articles. \nExisting Wiki Context: (Simplified for prompt size)\n${synthesisContext}` }
      ], llmOptions);

      fs.writeFileSync(path.join(conceptsDir, 'Latest-Synthesis.md'), conceptContent);
    }

    saveHistory(wikiDir, history);
    await updateIndex(wikiDir);

    spinner.succeed(chalk.green(`✓ Compiled ${refCompiled} References. Updated Synthesis.`));

  } catch (error) {
    spinner.fail(chalk.red(`Compilation failed: ${error.message}`));
  }
}

function getHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function loadHistory(wikiDir) {
  const historyPath = path.join(wikiDir, HISTORY_FILE);
  if (fs.existsSync(historyPath)) {
    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveHistory(wikiDir, history) {
  const historyPath = path.join(wikiDir, HISTORY_FILE);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

async function updateIndex(wikiDir) {
  const files = await globby(['**/*.md'], { cwd: wikiDir, ignore: [HISTORY_FILE, 'INDEX.md'] });
  let indexContent = '# Xknow Global Index\n\n> "Order from Chaos" - Managed by Xknow-CLI\n\n';
  
  const structure = { refs: {}, concepts: [] };
  
  for (const file of files) {
    if (file.startsWith('refs/')) {
      const parts = file.split('/');
      const category = parts[1];
      if (!structure.refs[category]) structure.refs[category] = [];
      structure.refs[category].push(parts.slice(2).join('/'));
    } else if (file.startsWith('concepts/')) {
      structure.concepts.push(file.replace('concepts/', ''));
    }
  }

  indexContent += '## 🏗️ Concepts (Synthesized)\n\n';
  for (const c of structure.concepts) {
    indexContent += `- [[concepts/${c.replace(/\.md$/, '')}|${c.replace(/\.md$/, '')}]]\n`;
  }

  indexContent += '\n## 📚 References (Sources)\n\n';
  for (const [category, items] of Object.entries(structure.refs)) {
    indexContent += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
    for (const item of items) {
      indexContent += `- [[refs/${category}/${item.replace(/\.md$/, '')}|${item.replace(/\.md$/, '')}]]\n`;
    }
    indexContent += '\n';
  }

  fs.writeFileSync(path.join(wikiDir, 'INDEX.md'), indexContent);
}
