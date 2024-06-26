const babel = require('@babel/core')
const fs = require('fs')
const path = require('path')
const {select} = require('hast-util-select')
const prism = require('@mapbox/rehype-prism')
const math = require('remark-math')
const katex = require('rehype-katex')
const prettier = require('prettier')
const {MDXProvider} = require('@mdx-js/tag')
const createElement = require('../create-element')
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')

const mdx = require('../')

const fixtureBlogPost = fs.readFileSync(
  path.join(__dirname, './fixtures/blog-post.md')
)

const fixturePonylang = fs.readFileSync(
  path.join(__dirname, './fixtures/ponylang.mdx')
)

const parse = code =>
  babel.parse(code, {
    plugins: [
      '@babel/plugin-syntax-jsx',
      '@babel/plugin-proposal-object-rest-spread'
    ]
  })

const transform = code =>
  babel.transform(code, {
    plugins: [
      '@babel/plugin-transform-react-jsx',
      '@babel/plugin-proposal-object-rest-spread'
    ]
  }).code

const renderWithReact = async mdxCode => {
  const jsx = await mdx(mdxCode, {skipExport: true})
  const code = transform(jsx)
  const scope = {mdx: createElement}

  const fn = new Function( // eslint-disable-line no-new-func
    'React',
    ...Object.keys(scope),
    `${code}; return React.createElement(MDXContent)`
  )

  const element = fn(React, ...Object.values(scope))
  const components = {
    h1: ({children}) =>
      React.createElement('h1', {style: {color: 'tomato'}}, children)
  }

  const elementWithProvider = React.createElement(
    MDXProvider,
    {components},
    element
  )

  return renderToStaticMarkup(elementWithProvider)
}

it('Should output parseable JSX', async () => {
  const result = await mdx('Hello World')

  parse(result)
})

it('Should be able to render JSX with React', async () => {
  const result = await renderWithReact(`# Hello, world!

    const code = () => \`template string\`
  `)

  expect(result).toContain('<h1 style="color:tomato">Hello, world!</h1>')
})

it('Should output parseable JSX when using < or >', async () => {
  const result = await mdx(`
  # Hello, MDX

  I <3 Markdown and JSX
  `)

  parse(result)
})

it('Should compile sample blog post', async () => {
  const result = await mdx(fixtureBlogPost)

  parse(result)
})

it('Should match sample blog post snapshot', async () => {
  const result = await mdx(`# Hello World`)

  expect(prettier.format(result, {parser: 'babel'})).toMatchInlineSnapshot(`
"/* @jsx mdx */

const layoutProps = {};
const MDXLayout = \\"wrapper\\";
export default function MDXContent({ components, ...props }) {
  return (
    <MDXLayout {...layoutProps} {...props} components={components}>
      <h1>{\`Hello World\`}</h1>
    </MDXLayout>
  );
}
MDXContent.isMDXComponent = true;
"
`)
})

it('Should render blockquote correctly', async () => {
  const result = await mdx('> test\n\n> `test`')

  parse(result)
})

it('Should properly expose comments', async () => {
  const result = await mdx('<!--foo-->', {
    rehypePlugins: [
      () => tree => {
        tree.children[0].value = 'bar'
      }
    ]
  })

  expect(result).toContain('{/*bar*/}')
})

it('Should render HTML inside inlineCode correctly', async () => {
  const result = await mdx('`<div>`')

  expect(result).toContain('<inlineCode parentName="p">{`<div>`}</inlineCode>')
})

it('Should preserve newlines in code blocks', async () => {
  const result = await mdx(
    `
\`\`\`dockerfile
# Add main script
COPY start.sh /home/start.sh
\`\`\`
    `,
    {rehypePlugins: [prism]}
  )

  expect(result).toContain('{`# Add main script`}</span>{`\n`}')
})

it('Should not escape literals in code blocks or inline code', async () => {
  await expect(() => renderWithReact(fixturePonylang)).not.toThrow()
})

it('Should preserve infostring in code blocks', async () => {
  const result = await mdx(
    `
\`\`\`dockerfile exec registry=something.com
# Add main script
COPY start.sh /home/start.sh
\`\`\`
  `
  )

  expect(result).toContain(
    `{...{"className":"language-dockerfile","metastring":"exec registry=something.com","exec":true,"registry":"something.com"}}`
  )
})

it('Should support comments', async () => {
  const result = await mdx(`
<!-- a Markdown comment -->
A paragraph

Some text <!-- an inline comment -->

\`\`\`md
<!-- a code block string -->
\`\`\`

<div>
  {/* a nested JSX comment */}
  <!-- div content -->
</div>

<!-- a comment above -->
- list item
<!-- a comment below -->

--> should be as-is

<MyComp content={\`
  <!-- a template literal -->
\`}
  `)
  expect(result).toContain('{/* a Markdown comment */}')
  expect(result).toContain('{/* an inline comment */}')
  expect(result).toContain('<!-- a code block string -->')
  expect(result).toContain('{/* a nested JSX comment */}')
  expect(result).toContain('<!-- div content -->')
  expect(result).toContain('{/* a comment above */}')
  expect(result).toContain('{/* a comment below */}')
  expect(result).toContain('--> should be as-is')
  expect(result).toContain('<!-- a template literal -->')
})

it('Should turn a newline into a space with adjacent anchors', async () => {
  const result = await renderWithReact(`
  [foo](/foo)
  [bar](/bar)
  `)

  expect(result).toContain('<a href="/foo">foo</a>\n<a href="/bar">bar</a>')
})

it('Should turn a newline into a space with other adjacent phrasing content', async () => {
  const result = await renderWithReact(`
  *foo*
  \`bar\`
  `)

  expect(result).toContain('<em>foo</em>\n<code>bar</code>')
})

it('Should convert style strings to camelized objects', async () => {
  const result = await mdx(
    `
$$
\\sum{1}
$$
  `,
    {
      remarkPlugins: [math],
      rehypePlugins: [katex]
    }
  )
  expect(result).not.toContain('"style":"')
  expect(result).toContain('"style":{')
})

it('Should convert data-* and aria-* properties to param-case', async () => {
  const result = await mdx(
    `
$$
\\sum{1}
$$
  `,
    {
      remarkPlugins: [math],
      rehypePlugins: [katex]
    }
  )
  expect(result).toContain('"aria-hidden":"true"')
})

it('Should support multiline default export statement', async () => {
  const result = await mdx(`export default ({ children }) => (
  <Layout>
    {children}
  </Layout>
)`)
  expect(() => parse(result)).not.toThrow()
})

it('Should support semicolons in default export statement', async () => {
  const result = await mdx(`export default Layout;`)
  expect(() => parse(result)).not.toThrow()
})

it('Should not include export wrapper if skipExport is true', async () => {
  const result = await mdx('> test\n\n> `test`', {skipExport: true})

  expect(result).not.toContain('export default ({components, ...props}) =>')
})

it('Should recognize components as properties', async () => {
  const result = await mdx('# Hello\n\n<MDX.Foo />')
  expect(result).toContain('<h1>{`Hello`}</h1>\n<MDX.Foo />')
})

it('Should contain static isMDXComponent() function', async () => {
  const result = await mdx('# Hello World')
  expect(result).toContain('MDXContent.isMDXComponent = true')
})

it('Should render elements without wrapping blank new lines', async () => {
  const result = await mdx(`
  | Test | Table |
  | :--- | :---- |
  | Col1 | Col2  |`)

  expect(result).not.toContain('{`\n`}')
})

test('Should await and render async plugins', async () => {
  const result = await mdx(fixtureBlogPost, {
    rehypePlugins: [
      _options => tree => {
        // eslint-disable-next-line require-await
        return (async () => {
          const headingNode = select('h1', tree)
          const textNode = headingNode.children[0]
          textNode.value = textNode.value.toUpperCase()
        })()
      }
    ]
  })

  expect(result).toMatch(/HELLO, WORLD!/)
})

test('Should process filepath and pass it to the plugins', async () => {
  const result = await mdx(fixtureBlogPost, {
    filepath: 'hello.mdx',
    rehypePlugins: [
      _options => (tree, fileInfo) => {
        expect(fileInfo.path).toBe('hello.mdx')
        const headingNode = select('h1', tree)
        const textNode = headingNode.children[0]
        textNode.value = textNode.value.toUpperCase()
      }
    ]
  })

  expect(result).toMatch(/HELLO, WORLD!/)
})

test.skip('Should handle inline JSX', async () => {
  const result = await mdx(
    'Hello, <span style={{ color: "tomato" }}>world</span>'
  )

  expect(result).toContain(
    '<MDXTag name="p" components={components}>Hello, <span style={{ color: "tomato" }}>world</span></MDXTag>'
  )
})

test('Should parse and render footnotes', async () => {
  const result = await mdx(
    'This is a paragraph with a [^footnote]\n\n[^footnote]: Here is the footnote'
  )

  expect(result).toContain('<sup parentName="p" {...{"id":"fnref-footnote"}}>')

  expect(result).toContain('<li parentName="ol" {...{"id":"fn-footnote"}}>')
}, 10000)

test('Should expose a sync compiler', () => {
  const result = mdx.sync(fixtureBlogPost)

  expect(result).toMatch(/Hello, world!/)
})

test('Should handle layout props', () => {
  const result = mdx.sync(fixtureBlogPost)

  expect(result).toMatchInlineSnapshot(`
"/* @jsx mdx */
import { Baz } from './Fixture'
import { Buz } from './Fixture'
export const foo = {
  hi: \`Fudge \${Baz.displayName || 'Baz'}\`,
  authors: [
    'fred',
    'sally'
  ]
}
const layoutProps = {
  foo
};
const MDXLayout = ({children}) => <div>{children}</div>
export default function MDXContent({ components, ...props }) {
  return (
    <MDXLayout
      {...layoutProps}
      {...props}
      components={components}>
      

<h1>{\`Hello, world!\`}</h1>
<p>{\`I'm an awesome paragraph.\`}</p>
{/* I'm a comment */}
<Foo bg='red'>
  <Bar>hi</Bar>
    {hello}
    {/* another commment */}
</Foo>
<pre><code parentName=\\"pre\\" {...{}}>{\`test codeblock
\`}</code></pre>
<pre><code parentName=\\"pre\\" {...{\\"className\\":\\"language-js\\"}}>{\`module.exports = 'test'
\`}</code></pre>
<pre><code parentName=\\"pre\\" {...{\\"className\\":\\"language-sh\\"}}>{\`npm i -g foo
\`}</code></pre>
<table>
<thead parentName=\\"table\\">
<tr parentName=\\"thead\\">
<th parentName=\\"tr\\" {...{\\"align\\":\\"left\\"}}>{\`Test\`}</th>
<th parentName=\\"tr\\" {...{\\"align\\":\\"left\\"}}>{\`Table\`}</th>
</tr>
</thead>
<tbody parentName=\\"table\\">
<tr parentName=\\"tbody\\">
<td parentName=\\"tr\\" {...{\\"align\\":\\"left\\"}}>{\`Col1\`}</td>
<td parentName=\\"tr\\" {...{\\"align\\":\\"left\\"}}>{\`Col2\`}</td>
</tr>
</tbody>
</table>

<pre><code parentName=\\"pre\\" {...{\\"className\\":\\"language-js\\"}}>{\`export const Button = styled.button\\\\\`
  font-size: 1rem;
  border-radius: 5px;
  padding: 0.25rem 1rem;
  margin: 0 1rem;
  background: transparent;
  color: \\\\\${props => props.theme.primary};
  border: 2px solid \\\\\${props => props.theme.primary};
  \\\\\${props =>
    props.primary &&
    css\\\\\`
      background: \\\\\${props => props.theme.primary};
      color: white;
    \\\\\`};
\\\\\`
\`}</code></pre>
    </MDXLayout>
    )
}
MDXContent.isMDXComponent = true"
`)
})

it('Should use fragment as Wrapper', async () => {
  const result = await renderWithReact(`# Hello, world!`)

  expect(result).toEqual('<h1 style="color:tomato">Hello, world!</h1>')
})
