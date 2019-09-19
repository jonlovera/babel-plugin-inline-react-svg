"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _path = require("path");

var _fs = require("fs");

var _parser = require("@babel/parser");

var _helperPluginUtils = require("@babel/helper-plugin-utils");

var _resolve = _interopRequireDefault(require("resolve"));

var _optimize = _interopRequireDefault(require("./optimize"));

var _escapeBraces = _interopRequireDefault(require("./escapeBraces"));

var _transformSvg = _interopRequireDefault(require("./transformSvg"));

var _fileExistsWithCaseSync = _interopRequireDefault(require("./fileExistsWithCaseSync"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var ignoreRegex;
var importRegex;

var _default = (0, _helperPluginUtils.declare)(function (_ref) {
  var assertVersion = _ref.assertVersion,
      template = _ref.template,
      traverse = _ref.traverse,
      t = _ref.types;
  assertVersion(7);

  var buildSvg = function buildSvg(_ref2) {
    var IS_EXPORT = _ref2.IS_EXPORT,
        EXPORT_FILENAME = _ref2.EXPORT_FILENAME,
        SVG_NAME = _ref2.SVG_NAME,
        SVG_CODE = _ref2.SVG_CODE,
        SVG_DEFAULT_PROPS_CODE = _ref2.SVG_DEFAULT_PROPS_CODE;
    var namedTemplate = "\n      var SVG_NAME = function SVG_NAME(props) { return SVG_CODE; };\n      ".concat(SVG_DEFAULT_PROPS_CODE ? 'SVG_NAME.defaultProps = SVG_DEFAULT_PROPS_CODE;' : '', "\n      ").concat(IS_EXPORT ? 'export { SVG_NAME };' : '', "\n    ");
    var anonymousTemplate = "\n      var Component = function (props) { return SVG_CODE; };\n      ".concat(SVG_DEFAULT_PROPS_CODE ? 'Component.defaultProps = SVG_DEFAULT_PROPS_CODE;' : '', "\n      Component.displayName = 'EXPORT_FILENAME';\n      export default Component;\n    ");

    if (SVG_NAME !== 'default') {
      return template(namedTemplate)({
        SVG_NAME: SVG_NAME,
        SVG_CODE: SVG_CODE,
        SVG_DEFAULT_PROPS_CODE: SVG_DEFAULT_PROPS_CODE
      });
    }

    return template(anonymousTemplate)({
      SVG_CODE: SVG_CODE,
      SVG_DEFAULT_PROPS_CODE: SVG_DEFAULT_PROPS_CODE,
      EXPORT_FILENAME: EXPORT_FILENAME
    });
  };

  function applyPlugin(importIdentifier, importPath, path, state, isExport, exportFilename) {
    if (typeof importPath !== 'string') {
      throw new TypeError('`applyPlugin` `importPath` must be a string');
    }

    var _state$opts = state.opts,
        ignorePattern = _state$opts.ignorePattern,
        importPattern = _state$opts.importPattern,
        caseSensitive = _state$opts.caseSensitive,
        providedFilename = _state$opts.filename;
    var file = state.file,
        filename = state.filename;

    if (ignorePattern) {
      // Only set the ignoreRegex once:
      ignoreRegex = ignoreRegex || new RegExp(ignorePattern); // Test if we should ignore this:

      if (ignoreRegex.test(importPath)) {
        return;
      }
    } // This plugin only applies for SVGs:


    if ((0, _path.extname)(importPath) === '.svg') {
      if (importPattern) {
        // Only set the importPattern once:
        importRegex = importRegex || new RegExp(importPattern);
        var hasImportRegex = path.node.specifiers.findIndex(function (node) {
          return node.imported && importRegex.test(node.imported.name);
        }) > -1; // Test if we should ignore this:

        if (!hasImportRegex) {
          return;
        }
      }

      var iconPath = filename || providedFilename;

      var svgPath = _resolve["default"].sync(importPath, {
        basedir: (0, _path.dirname)(iconPath)
      });

      if (caseSensitive && !(0, _fileExistsWithCaseSync["default"])(svgPath)) {
        throw new Error("File path didn't match case of file on disk: ".concat(svgPath));
      }

      if (!svgPath) {
        throw new Error("File path does not exist: ".concat(importPath));
      }

      var rawSource = (0, _fs.readFileSync)(svgPath, 'utf8');
      var optimizedSource = state.opts.svgo === false ? rawSource : (0, _optimize["default"])(rawSource, state.opts.svgo);
      var escapeSvgSource = (0, _escapeBraces["default"])(optimizedSource);
      var parsedSvgAst = (0, _parser.parse)(escapeSvgSource, {
        sourceType: 'module',
        plugins: ['jsx']
      });
      traverse(parsedSvgAst, (0, _transformSvg["default"])(t));
      var svgCode = traverse.removeProperties(parsedSvgAst.program.body[0].expression);
      var opts = {
        SVG_NAME: importIdentifier,
        SVG_CODE: svgCode,
        IS_EXPORT: isExport,
        EXPORT_FILENAME: exportFilename
      }; // Move props off of element and into defaultProps

      if (svgCode.openingElement.attributes.length > 1) {
        var keepProps = [];
        var defaultProps = [];
        svgCode.openingElement.attributes.forEach(function (prop) {
          if (prop.type === 'JSXSpreadAttribute') {
            keepProps.push(prop);
          } else {
            defaultProps.push(t.objectProperty(t.identifier(prop.name.name), prop.value));
          }
        });
        svgCode.openingElement.attributes = keepProps;
        opts.SVG_DEFAULT_PROPS_CODE = t.objectExpression(defaultProps);
      }

      if (opts.SVG_DEFAULT_PROPS_CODE) {
        var svgReplacement = buildSvg(opts);
        path.replaceWithMultiple(svgReplacement);
      } else {
        var _svgReplacement = buildSvg(opts);

        path.replaceWith(_svgReplacement);
      }

      file.get('ensureReact')();
      file.set('ensureReact', function () {});
    }
  }

  return {
    visitor: {
      Program: {
        enter: function enter(_ref3, _ref4) {
          var scope = _ref3.scope,
              node = _ref3.node;
          var file = _ref4.file,
              opts = _ref4.opts,
              filename = _ref4.filename;

          if (typeof filename === 'string' && typeof opts.filename !== 'undefined') {
            throw new TypeError('the "filename" option may only be provided when transforming code');
          }

          if (typeof filename === 'undefined' && typeof opts.filename !== 'string') {
            throw new TypeError('the "filename" option is required when transforming code');
          }

          if (!scope.hasBinding('React')) {
            var reactImportDeclaration = t.importDeclaration([t.importDefaultSpecifier(t.identifier('React'))], t.stringLiteral('react'));
            file.set('ensureReact', function () {
              node.body.unshift(reactImportDeclaration);
            });
          } else {
            file.set('ensureReact', function () {});
          }
        }
      },
      CallExpression: function CallExpression(path, state) {
        var node = path.node;
        var requireArg = node.arguments.length > 0 ? node.arguments[0] : null;
        var filePath = t.isStringLiteral(requireArg) ? requireArg.value : null;

        if (node.callee.name === 'require' && t.isVariableDeclarator(path.parent) && filePath) {
          applyPlugin(path.parent.id, filePath, path.parentPath.parentPath, state);
        }
      },
      ImportDeclaration: function ImportDeclaration(path, state) {
        var node = path.node;

        if (node.specifiers.length > 0) {
          applyPlugin(node.specifiers[0].local, node.source.value, path, state);
        }
      },
      ExportNamedDeclaration: function ExportNamedDeclaration(path, state) {
        var node = path.node;

        if (node.specifiers.length > 0 && node.specifiers[0].local.name === 'default') {
          var exportName = node.specifiers[0].exported.name;
          var filename = (0, _path.parse)(node.source.value).name;
          applyPlugin(exportName, node.source.value, path, state, true, filename);
        }
      }
    }
  };
});

exports["default"] = _default;