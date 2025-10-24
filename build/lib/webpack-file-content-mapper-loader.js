
const {
	getOptions
} = require('loader-utils');

module.exports = function(content) {
	const options = getOptions(this);
	const mapper = options.mapper(this.resourcePath.replace(/\\/g, '/'));
	if (mapper) {
		return mapper(content);
	}
	return content;
};
