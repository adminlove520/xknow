// lib/query.js - Intelligent Q&A with Dynamic Context Selection

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { globby } from 'globby';
import { callLLM, PROMPTS } from './llm.js';
import { expandHome } from './config.js';

/**
 * Intelligent Q&A with dynamic context selection
 */
export async function query(config, question, options = {}) {
  const format = options.format || 'markdown';
  const spinner = ora(chalk.cyan(`Researching KB (Format: ${format})...`)).start();

  try {
    const wikiDir = expandHome(config.wikiPath);
    if (!fs.existsSync(wikiDir)) {
      spinner.fail(chalk.red('Wiki directory does not exist. Run compile first.'));
      return;
    }

    // LLM config overrides from CLI
    const llmOptions = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      apiType: options.apiType
    };

    // 1. Dynamic Context Selection (Step 1)
    spinner.text = chalk.cyan('Step 1: Analyzing index to find relevant articles...');
    const indexContent = fs.readFileSync(path.join(wikiDir, 'INDEX.md'), 'utf8');
    
    const selectionPrompt = `You are a Librarian. Given the following Wiki Index and a user's question, identify the top 5-7 most relevant article paths (e.g., "refs/articles/file.md" or "concepts/file.md").
Output ONLY a comma-separated list of relative paths.

Index:
${indexContent.substring(0, 5000)}

Question: ${question}`;

    const selectedPathsRaw = await callLLM([
      { role: 'user', content: selectionPrompt }
    ], { ...llmOptions, temperature: 0 });

    const selectedPaths = selectedPathsRaw.split(',')
      .map(p => p.trim())
      .filter(p => p.endsWith('.md') && fs.existsSync(path.join(wikiDir, p)));

    // 2. Build KB Context (Step 2)
    spinner.text = chalk.cyan(`Step 2: Loading ${selectedPaths.length} relevant articles...`);
    let context = `--- Relevant Files Found ---\n${selectedPaths.join(', ')}\n`;
    
    for (const f of selectedPaths) {
      const content = fs.readFileSync(path.join(wikiDir, f), 'utf8');
      context += `\n--- File: ${f} ---\n${content}\n`;
    }

    // Fallback if no specific paths found
    if (selectedPaths.length === 0) {
      spinner.info(chalk.yellow('No specific matches found in Index, using latest concepts as fallback.'));
      const conceptFiles = await globby(['concepts/*.md'], { cwd: wikiDir, limit: 5 });
      for (const f of conceptFiles) {
        const content = fs.readFileSync(path.join(wikiDir, f), 'utf8');
        context += `\n--- File: ${f} ---\n${content}\n`;
      }
    }

    spinner.text = chalk.cyan('Step 3: Synthesizing answer...');

    // 3. Call LLM for final Q&A
    const answer = await callLLM([
      { role: 'system', content: PROMPTS.QUERY },
      { role: 'user', content: `Current Format: ${format}\nQuestion: ${question}\n\nSelected Context:\n${context}` }
    ], llmOptions);

    spinner.stop();
    console.log(chalk.bold(`\n❓ ${question}\n`));
    console.log(chalk.green(`💡 Answer (${format}):`));
    console.log(`\n${answer}\n`);

    // 4. Persistence
    if (options.save) {
      const reportName = `Search-${Date.now()}.md`;
      const reportPath = path.join(wikiDir, 'concepts', reportName);
      const fileContent = `---
title: "Synthesis: ${question}"
date: ${new Date().toISOString()}
sources: ${selectedPaths.join(', ')}
---

# ${question}

${answer}

---
*Synthesized by Xknow-CLI from your knowledge base.*
`;
      fs.writeFileSync(reportPath, fileContent);
      console.log(chalk.cyan(`✓ synthesis saved to ${reportPath}`));
    }

  } catch (error) {
    spinner.fail(chalk.red(`Query failed: ${error.message}`));
  }
}
