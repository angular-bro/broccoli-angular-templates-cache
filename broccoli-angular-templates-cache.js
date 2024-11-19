var CachingWriter = require('broccoli-caching-writer'),
    recursive = require('recursive-readdir'),
    htmlMin = require('html-minifier-terser').minify,
    fs = require("fs"),
    mkdirp = require('mkdirp'),
    path = require("path");

var reQuote = /'/g,
    escapedQuote = '\\\'',
    reNewLine = /\r?\n/g,
    escapedNewLine = '\\n\' +\n \'';

function escapeHtmlContent(content) {
	return content.replace(reQuote, escapedQuote).replace(reNewLine, escapedNewLine);
}
function escapeTags(content) {
	return content.replace(/</mg, '&lt;').replace(/>/mg, '&gt;');
}
function angularModuleTemplate(moduleName, templateCode) {
	return 'angular.module("' + moduleName + '").run([\'$templateCache\', function(a) { ' + templateCode + ' }]);';
}
function transformTemplates(templates, strip, prepend, minify) {
	const promises = templates.map(function (template) {
		return transformTemplateEntry(template, strip, prepend, minify);
	});
	return Promise.all(promises).then(function (templates) {
		return templates.join('')
	});
}
function transformTemplateEntry(entry, strip, prepend, minify) {
	var path = entry.path,
	parseError;

	if (strip) {
		path = stripPath(path, strip);
	}
	if (prepend) {
		path = prepend + path;
	}
	return new Promise(function (resolve, reject) {
		const promise = minify !== false ? htmlMin(entry.content, minify) : Promise.resolve(entry.content);

		promise.then(function (content) {
			content = escapeHtmlContent(content);
			resolve('a.put(\'' + path + '\', \'' + content + '\');\n\t');
		}, function (e) {
			parseError = String(e);
			resolve('<h1>Invalid template: ' + entry.path + '</h1>' + '<pre>' + escapeTags(parseError) + '</pre>');
		});
	})
}

function stripPath(path, strip) {
	path = path.split(strip);
	path.shift();
	return path.join(strip).replace(/\\/g, '/');
}

var BroccoliAngularTemplateCache = function BroccoliAngularTemplateCache(inTree, options) {
	if (!(this instanceof BroccoliAngularTemplateCache)) {
    	return new BroccoliAngularTemplateCache(inTree, options);
  }
  this.options = options || {};
	CachingWriter.apply(this, arguments);
};
BroccoliAngularTemplateCache.prototype = Object.create(CachingWriter.prototype);
BroccoliAngularTemplateCache.prototype.constructor = BroccoliAngularTemplateCache;
BroccoliAngularTemplateCache.prototype.description = 'angular templates cache';


BroccoliAngularTemplateCache.prototype.build = function() {
	var self = this,
		srcDir = self.inputPaths,
		destDir = self.outputPath,
		dest;

	var src = path.join(srcDir[0],self.options.srcDir);

  if(self.options.absolute){
    dest = self.options.destDir+'/'+self.options.fileName;
  }else{
    dest = path.join(destDir,self.options.destDir+'/'+self.options.fileName);
  }
	mkdirp.sync(path.dirname(dest));

	var promise = new Promise(function(resolvePromise, rejectPromise) {
		recursive(src, function (err, files) {

			var templates = [],
			minify = self.options.minify || false,
			prepend = self.options.prepend || false,
			strip = self.options.strip || false,
			moduleName = self.options.moduleName,
			firstFile = null,
			filePath;

			files.forEach(function(file){
				filePath = file.replace(srcDir[0]+'/','');
				templates.push({
					path: filePath || file,
					content: fs.readFileSync(file).toString('utf-8')
				});
			});
			transformTemplates(templates, strip, prepend, minify).then(function (joinedContents) {
				var module = angularModuleTemplate(moduleName, joinedContents);
				fs.writeFile(dest,module,function(err){
					if(err){
						rejectPromise(err);
					}else{
						resolvePromise('templates created');
					}
				});
			}, rejectPromise);
		});
	});
	return promise;
}
module.exports = BroccoliAngularTemplateCache;
