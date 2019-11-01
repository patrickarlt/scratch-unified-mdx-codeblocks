const { read, write } = require("to-vfile");
const remark = require("remark");
const mdx = require("remark-mdx");
const visit = require("unist-util-visit");
const parse = require("@babel/parser").parse;
const generate = require("@babel/generator").default;
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");
const { readFileSync } = require("fs");
const { dirname } = require("path");

const expandCodeBlocks = () => (tree, vfile) => {
  function processCodeBlocks(jsx, vfile) {
    const jsxAST = parse(jsx, {
      plugins: ["jsx"]
    });

    const JSXVisitor = {
      JSXElement(path) {
        if (path.node.openingElement.name.name === "CodeBlock") {
          const { value } = path.node.openingElement.attributes.find(
            node => node.name.name === "file"
          );

          const content = readFileSync(value.value, {
            cwd: dirname(vfile.path)
          }).toString();

          path.node.children.push(t.jsxText("\n" + content));
          path.node.openingElement.selfClosing = false;
          path.node.closingElement = t.jsxClosingElement(
            t.jsxIdentifier("CodeBlock")
          );
        }
      }
    };

    traverse(jsxAST, JSXVisitor);

    const { code } = generate(jsxAST, {}, jsx);
    return code;
  }

  visit(tree, "jsx", node => {
    node.value = processCodeBlocks(node.value, vfile);
  });
};

const expandCodeTicks = () => (tree, vfile) => {
  function parseMetaString(meta = "") {
    return meta
      .split(" ")
      .map(param => param.split("="))
      .reduce((props, [prop, value]) => {
        props[prop] = value;
        return props;
      }, {});
  }

  visit(tree, "code", node => {
    if (!node.meta) {
      return;
    }

    const props = parseMetaString(node.meta);

    if (!props.file) {
      return;
    }

    node.value = readFileSync(props.file, {
      cwd: dirname(vfile.path)
    })
      .toString()
      .trim();
  });
};

(async () => {
  const inPath = "./example.mdx";
  const outPath = "./example-out.mdx";

  const file = await read(inPath);

  const contents = await remark()
    .use(mdx)
    .use(expandCodeTicks)
    .use(expandCodeBlocks)
    .process(file);

  await write({
    path: outPath,
    contents
  });
})();
