/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { createStaticWorkbenchHtml, renderWorkbenchTemplate } from '../../gulpfile.vscode.web.ts';
import * as task from '../gulp/task.ts';

suite('Static Web Packaging', () => {
	test('renders static index.html with appropriate configuration and base URL', () => {
		const html = createStaticWorkbenchHtml('.');

		assert.ok(html.includes('<meta id="vscode-workbench-web-configuration"'), 'has workbench configuration meta tag');
		assert.ok(html.includes('<meta id="vscode-workbench-web-base-url"'), 'has workbench base-url meta tag');
		assert.ok(html.includes('data-settings="."'), 'base URL defaults to "."');
		assert.ok(html.includes('&quot;serverBasePath&quot;:&quot;.&quot;'), 'serverBasePath in settings is "."');
		assert.ok(html.includes('href="./out/vs/code/browser/workbench/workbench.css"'), 'references workbench css');
		assert.ok(html.includes('src="./out/vs/code/browser/workbench/workbench.js"'), 'references workbench js module');
		assert.ok(html.includes('src="./out/nls.messages.js"'), 'references nls fallback url');
	});

	test('renders static html with custom base URL for subpath hosting', () => {
		const customBase = 'https://my-user.github.io/my-repo';
		const html = createStaticWorkbenchHtml(customBase);

		assert.ok(html.includes(`data-settings="${customBase}"`), 'contains custom base URL');
		assert.ok(html.includes(`href="${customBase}/out/vs/code/browser/workbench/workbench.css"`), 'references custom workbench css');
		assert.ok(html.includes(`src="${customBase}/out/vs/code/browser/workbench/workbench.js"`), 'references custom workbench js module');
	});

	test('substitutes undefined template placeholders safely', () => {
		const template = '<div>{{WORKBENCH_WEB_BASE_URL}}</div><div>{{MISSING_KEY}}</div>';
		const rendered = renderWorkbenchTemplate(template, { WORKBENCH_WEB_BASE_URL: '/test' });

		assert.strictEqual(rendered, '<div>/test</div><div>undefined</div>');
	});

	test('registers static gulp tasks', () => {
		const staticTask = task.task('vscode-web-static');
		const staticMinTask = task.task('vscode-web-static-min');

		assert.ok(staticTask, 'vscode-web-static task is registered');
		assert.ok(staticMinTask, 'vscode-web-static-min task is registered');
	});
});
