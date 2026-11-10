/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp, rename, filter, jsonEditor } from './lib/gulp/facade.ts';
import * as path from 'path';
import es from 'event-stream';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/gulp/task.ts';
import { writeISODate } from './lib/date.ts';
import product from '../product.json' with { type: 'json' };
import { getFlatProductionDependencies, toPackagedLayout } from './lib/dependencies.ts';
import vfs from 'vinyl-fs';
import packageJson from '../package.json' with { type: 'json' };
import { compileApiProposalNamesTask, copyCodiconsTask } from './lib/compilation.ts';
import * as extensions from './lib/extensions.ts';
import { runEsbuildBundle } from './lib/esbuild.ts';
import File from 'vinyl';
import * as fs from 'fs';

const REPO_ROOT = path.dirname(import.meta.dirname);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = path.join(REPO_ROOT, 'remote', 'web');

const commit = getVersion(REPO_ROOT);
const quality = (product as { quality?: string }).quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
const esbuildBundleVSCodeWebTask = task.define('esbuild-vscode-web', () => runEsbuildBundle('out-vscode-web', false, true, 'web'));
const esbuildBundleVSCodeWebMinTask = task.define('esbuild-vscode-web-min', () => runEsbuildBundle('out-vscode-web-min', true, true, 'web', `${sourceMappingURLBase}/core`));

function htmlAttributeEncodeValue(value: string): string {
	return value.replace(/[<>"'&]/g, ch => {
		switch (ch) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			case '\'': return '&apos;';
			case '&': return '&amp;';
		}
		return ch;
	});
}

export function renderWorkbenchTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => htmlAttributeEncodeValue(values[key] ?? 'undefined'));
}

export function createStaticWorkbenchHtml(baseUrl: string = process.env['VSCODE_STATIC_BASE_URL'] || '.'): string {
	const templatePath = path.join(REPO_ROOT, 'src', 'vs', 'code', 'browser', 'workbench', 'workbench.html');
	const template = fs.readFileSync(templatePath, 'utf8');

	const workbenchWebConfiguration = {
		serverBasePath: baseUrl,
		_wrapWebWorkerExtHostInIframe: false,
		callbackRoute: `${baseUrl}/callback`
	};

	const scriptNonce = 'static-build-nonce';
	const values: Record<string, string> = {
		WORKBENCH_WEB_CONFIGURATION: JSON.stringify(workbenchWebConfiguration),
		WORKBENCH_AUTH_SESSION: '',
		WORKBENCH_WEB_BASE_URL: baseUrl,
		WORKBENCH_NLS_URL: '',
		WORKBENCH_NLS_FALLBACK_URL: `${baseUrl}/out/nls.messages.js`,
		WORKBENCH_SCRIPT_NONCE: scriptNonce
	};

	return renderWorkbenchTemplate(template, values);
}

function packageTask(sourceFolderName: string, destinationFolderName: string) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname!.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src('.build/web/extensions/**', { base: '.build/web', dot: true });

		const sources = es.merge(src, extensions)
			.pipe(filter(['**', '!**/*.{js,css}.map'], { dot: true }));

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/web/package.json'], { base: 'remote/web' })
			.pipe(jsonEditor({ name, version, type: 'module' }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote', allowEmpty: true });

		// `remote/web` is a member of the `remote` workspace. The web build packages its production
		// dependencies flat, in its own `node_modules`.
		const deps = es.merge(...getFlatProductionDependencies(WEB_FOLDER).map(dependency => {
			const d = path.relative(REPO_ROOT, dependency.source);
			return gulp.src([`${d}/**`, `!${d}/node_modules/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`], { base: path.relative(REPO_ROOT, dependency.base), dot: true })
				.pipe(toPackagedLayout([dependency]));
		}))
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(import.meta.dirname, '.webignore')));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });
		const manifest = gulp.src('resources/server/manifest.json', { base: 'resources/server' });
		const pwaicons = es.merge(
			gulp.src('resources/server/code-192.png', { base: 'resources/server' }),
			gulp.src('resources/server/code-512.png', { base: 'resources/server' })
		);

		const all = es.merge(
			packageJsonStream,
			license,
			sources,
			deps,
			favicon,
			manifest,
			pwaicons
		);

		const result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

const compileWebExtensionsBuildTask = task.define('compile-web-extensions-build', task.series(
	task.define('clean-web-extensions-build', util.rimraf('.build/web/extensions')),
	task.define('bundle-web-extensions-build', () => extensions.packageAllLocalExtensionsStream(true).pipe(gulp.dest('.build/web'))),
	task.define('bundle-marketplace-web-extensions-build', () => extensions.packageMarketplaceExtensionsStream(true).pipe(gulp.dest('.build/web'))),
	task.define('bundle-web-extension-media-build', () => extensions.buildExtensionMedia(false, '.build/web/extensions')),
));
task.task(compileWebExtensionsBuildTask);

const dashed = (str: string) => (str ? `-${str}` : ``);

function packageStaticTask(sourceFolderName: string, destinationDir: string) {
	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname!.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src('.build/web/extensions/**', { base: '.build/web', dot: true });

		const sources = es.merge(src, extensions)
			.pipe(filter(['**', '!**/*.{js,css}.map'], { dot: true }));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });
		const manifest = gulp.src('resources/server/manifest.json', { base: 'resources/server' });
		const pwaicons = es.merge(
			gulp.src('resources/server/code-192.png', { base: 'resources/server' }),
			gulp.src('resources/server/code-512.png', { base: 'resources/server' })
		);

		// Static site entry points: index.html, .nojekyll, and optional CNAME for GitHub Pages
		const staticFiles: File[] = [
			new File({
				path: 'index.html',
				base: '.',
				contents: Buffer.from(createStaticWorkbenchHtml())
			}),
			new File({
				path: '.nojekyll',
				base: '.',
				contents: Buffer.from('')
			})
		];

		const cnameContent = process.env['VSCODE_STATIC_CNAME']
			?? (fs.existsSync(path.join(REPO_ROOT, 'CNAME')) ? fs.readFileSync(path.join(REPO_ROOT, 'CNAME'), 'utf8').trim() : undefined);

		if (cnameContent) {
			staticFiles.push(new File({
				path: 'CNAME',
				base: '.',
				contents: Buffer.from(`${cnameContent}\n`)
			}));
		}

		const staticFilesStream = es.readArray(staticFiles);

		const all = es.merge(
			sources,
			favicon,
			manifest,
			pwaicons,
			staticFilesStream
		);

		const result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destinationDir));
	};
}

const staticOutDir = process.env['VSCODE_STATIC_OUT_DIR'] ? path.resolve(REPO_ROOT, process.env['VSCODE_STATIC_OUT_DIR']) : path.join(REPO_ROOT, 'dist');

['', 'min'].forEach(minified => {
	const sourceFolderName = `out-vscode-web${dashed(minified)}`;
	const destinationFolderName = `vscode-web`;

	const vscodeWebTaskCI = task.define(`vscode-web${dashed(minified)}-ci`, task.series(
		copyCodiconsTask,
		compileWebExtensionsBuildTask,
		minified ? esbuildBundleVSCodeWebMinTask : esbuildBundleVSCodeWebTask,
		util.rimraf(path.join(BUILD_ROOT, destinationFolderName)),
		packageTask(sourceFolderName, destinationFolderName)
	));
	task.task(vscodeWebTaskCI);

	const vscodeWebTask = task.define(`vscode-web${dashed(minified)}`, task.series(
		compileApiProposalNamesTask,
		writeISODate('out-build'),
		vscodeWebTaskCI
	));
	task.task(vscodeWebTask);

	const vscodeWebStaticTask = task.define(`vscode-web-static${dashed(minified)}`, task.series(
		compileApiProposalNamesTask,
		writeISODate('out-build'),
		copyCodiconsTask,
		compileWebExtensionsBuildTask,
		minified ? esbuildBundleVSCodeWebMinTask : esbuildBundleVSCodeWebTask,
		util.rimraf(staticOutDir),
		packageStaticTask(sourceFolderName, staticOutDir)
	));
	task.task(vscodeWebStaticTask);
});
