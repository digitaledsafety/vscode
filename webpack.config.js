
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const {
	vscodeWebResources,
	createVSCodeWebFileContentMapper
} = require('./build/gulpfile.vscode.web');

const REPO_ROOT = __dirname;

const vscodeWebEntryPoints = [
	'vs/workbench/workbench.web.main',
	'vs/workbench/workbench.web.main.internal',
	'vs/code/browser/workbench/workbench',
	'vs/base/worker/workerMain',
	'vs/editor/editor.worker',
	'vs/workbench/services/extensions/worker/extensionHost.worker',
	'vs/workbench/services/notebook/common/notebook.worker',
	'vs/platform/languageDetection/common/languageDetectionWorker',
	'vs/workbench/services/search/worker/localFileSearch.worker',
	'vs/workbench/contrib/output/common/outputLinkComputer.worker',
	'vs/editor/common/services/editorSimpleWorker',
	'vs/workbench/services/themes/browser/fileIconThemeData',
	'vs/workbench/services/textMate/browser/textMate.worker'
].flat();

module.exports = {
	mode: 'production',
	target: 'webworker',
	entry: vscodeWebEntryPoints.reduce((acc, entry) => {
		const name = entry.replace(/\.js$/, '');
		acc[name] = path.join(REPO_ROOT, 'out-build', `${name}.js`);
		return acc;
	}, {}),
	output: {
		path: path.join(REPO_ROOT, 'out-vscode-web'),
		filename: '[name].js'
	},
	resolve: {
		extensions: ['.js']
	},
	module: {
		rules: [{
			test: /\.js$/,
			enforce: 'pre',
			use: [{
				loader: path.resolve(path.join(REPO_ROOT, 'build', 'lib', 'webpack-file-content-mapper-loader.js')),
				options: {
					mapper: createVSCodeWebFileContentMapper(path.join(REPO_ROOT, '.build', 'web', 'extensions'), require('./product.json'))
				}
			}]
		}, {
			test: /\.css$/,
			use: ['style-loader', 'css-loader']
		}, ]
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: vscodeWebResources.map(resource => ({
				from: path.join(REPO_ROOT, resource),
				to: path.join(REPO_ROOT, 'out-vscode-web', resource.replace('out-build/', ''))
			}))
		})
	],
	performance: {
		hints: false
	},
	devtool: 'source-map'
};
