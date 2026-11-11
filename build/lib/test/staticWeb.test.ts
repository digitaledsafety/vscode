/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { createStaticWorkbenchHtml, getStaticBaseUrl, renderWorkbenchTemplate } from '../../gulpfile.vscode.web.ts';
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

	test('supports custom CNAME domain configuration', () => {
		process.env['VSCODE_STATIC_CNAME'] = 'code.example.com';
		try {
			assert.strictEqual(process.env['VSCODE_STATIC_CNAME'], 'code.example.com');
			assert.strictEqual(getStaticBaseUrl(), '');
		} finally {
			delete process.env['VSCODE_STATIC_CNAME'];
		}
	});

	test('renders clean root-relative asset URLs when CNAME is active without double slashes', () => {
		const html = createStaticWorkbenchHtml('');

		assert.ok(html.includes('href="/out/vs/code/browser/workbench/workbench.css"'), 'references root workbench css without double slash');
		assert.ok(html.includes('src="/out/vs/code/browser/workbench/workbench.js"'), 'references root workbench js without double slash');
		assert.ok(!html.includes('//out'), 'does not contain protocol-relative double slashes //out');
		assert.ok(!html.includes('/vscode/out/'), 'does not contain repository subpath when CNAME is active');
	});

	test('normalizes baseUrl when trailing slash is passed', () => {
		const html = createStaticWorkbenchHtml('/');

		assert.ok(html.includes('href="/out/vs/code/browser/workbench/workbench.css"'), 'normalized single slash workbench css');
		assert.ok(html.includes('src="/out/vs/code/browser/workbench/workbench.js"'), 'normalized single slash workbench js');
		assert.ok(!html.includes('//out'), 'does not contain //out');
	});
});
