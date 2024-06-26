[MDX Blog](/blog)

# Custom pragma

`MDXTag`, for those that aren’t aware, is a critical piece in the way
MDX replaces HTML primitives like `<pre>` and `<h1>` with custom React
Components.  [I’ve previously
written](/post/codeblocks-mdx-and-mdx-utils) about the way `MDXTag`
works when trying to replace the `<pre>` tag with a custom code
component.  [mdx-utils](https://github.com/ChristopherBiscardi/gatsby-mdx/blob/00769a1b72455f40843cd2f09ee34fd63b009fb2/packages/mdx-utils/index.js)
contains the methodology for pulling the props around appropriately
through the `MDXTag` elements that are inbetween `pre` and `code`.

```js
exports.preToCodeBlock = preProps => {
  if (
    // children is MDXTag
    preProps.children &&
    // MDXTag props
    preProps.children.props &&
    // if MDXTag is going to render a <code>
    preProps.children.props.name === 'code'
  ) {
    // we have a <pre><code> situation
    const {
      children: codeString,
      props: {className, ...props}
    } = preProps.children.props

    return {
      codeString: codeString.trim(),
      language: className && className.split('-')[1],
      ...props
    }
  }
  return undefined
}
```

So `MDXTag` is a real Component in the middle of all of the other MDX
rendered elements.  All of the code is included here for reference.

```js
import React, {Component} from 'react'

import {withMDXComponents} from './mdx-provider'

const defaults = {
  inlineCode: 'code',
  wrapper: 'div'
}

class MDXTag extends Component {
  render() {
    const {
      name,
      parentName,
      props: childProps = {},
      children,
      components = {},
      Layout,
      layoutProps
    } = this.props

    const Component =
      components[`${parentName}.${name}`] ||
      components[name] ||
      defaults[name] ||
      name

    if (Layout) {
      return (
        <Layout components={components} {...layoutProps}>
          <Component {...childProps}>{children}</Component>
        </Layout>
      )
    }

    return <Component {...childProps}>{children}</Component>
  }
}

export default withMDXComponents(MDXTag)
```

`MDXTag` is used in the [mdx-hast-to-jsx
conversion](https://github.com/mdx-js/mdx/blob/e1bcf1b1a352c9728424b01c1bb5d62e450eb48d/packages/mdx/mdx-hast-to-jsx.js#L163-L165),
which is the final step in the MDX AST pipeline.  Every renderable
element is wrapped in an `MDXTag`, and `MDXTag` handled rendering the
element later.

```js
return `<MDXTag name="${node.tagName}" components={components}${
  parentNode.tagName ? ` parentName="${parentNode.tagName}"` : ''
}${props ? ` props={${props}}` : ''}>${children}</MDXTag>`
```

## A concrete example

The following MDX

```mdx
# a title

    and such

testing
```

turns into the following React code

```js
export default ({components, ...props}) => (
  <MDXTag name="wrapper" components={components}>
    <MDXTag name="h1" components={components}>{`a title`}</MDXTag>{' '}
    <MDXTag name="pre" components={components}>
      <MDXTag
        name="code"
        components={components}
        parentName="pre"
        props={{metaString: null}}
      >{`and such `}</MDXTag>
    </MDXTag>{' '}
    <MDXTag name="p" components={components}>{`testing`}</MDXTag>
  </MDXTag>
)
```

resulting in the following HTML

```html
<div>
  <h1>a title</h1>
  <pre>
    <code>and such</code>
  </pre>
  <p>testing</p>
</div>
```

## createElement

With the new approach, the above MDX transforms into this new React code

```js
const layoutProps = {}
export default class MDXContent extends React.Component {
  constructor(props) {
    super(props)
    this.layout = null
  }
  render() {
    const {components, ...props} = this.props
    const Layout = this.layout

    return (
      <div name="wrapper" components={components}>
        <h1>{`a title`}</h1>
        <pre>
          <code parentName="pre" {...{}}>{`and such
`}</code>
        </pre>
        <p>{`testing`}</p>
      </div>
    )
  }
}
MDXContent.isMDXComponent = true
```

Notice how now the React elements are plainly readable without
wrapping `MDXTag`.

Now that we’ve cleaned up the intermediary representation, we need to
make sure that we have the same functionality as the old
`MDXTag`.  This is done through a custom `createElement`
implementation.  Typically when using React, we use
`React.createElement` to render the elements onscreen but this time
we’ll be using our own.

```js
const React = require('react')
const {withMDXComponents} = require('@mdx-js/tag')

const TYPE_PROP_NAME = '__MDX_TYPE_PLEASE_DO_NOT_USE__'

const DEFAULTS = {
  inlineCode: 'code',
  wrapper: 'div'
}

const MDXCreateElementInner = ({
  components = {},
  __MDX_TYPE_PLEASE_DO_NOT_USE__,
  parentName,
  ...etc
}) => {
  const type = __MDX_TYPE_PLEASE_DO_NOT_USE__
  const Component =
    components[`${parentName}.${type}`] ||
    components[type] ||
    DEFAULTS[type] ||
    type

  return React.createElement(Component, etc)
}
MDXCreateElementInner.displayName = 'MDXCreateElementInner'

const MDXCreateElement = withMDXComponents(MDXCreateElementInner)
MDXCreateElement.displayName = 'MDXCreateElement'

module.exports = function(type, props) {
  const args = arguments

  if (typeof type === 'string') {
    const argsLength = args.length

    const createElementArgArray = new Array(argsLength)
    createElementArgArray[0] = MDXCreateElement

    const newProps = {}
    for (let key in props) {
      if (hasOwnProperty.call(props, key)) {
        newProps[key] = props[key]
      }
    }

    newProps[TYPE_PROP_NAME] = type

    createElementArgArray[1] = newProps

    for (let i = 2; i < argsLength; i++) {
      createElementArgArray[i] = args[i]
    }

    return React.createElement.apply(null, createElementArgArray)
  }

  return React.createElement.apply(null, args)
}
```

## Vue

One really cool application of the new output format using a custom
`createElement` is that we can now write versions of it for Vue and
other frameworks.  Since the pragma insertion is the responsibility of
the webpack (or other bundlers) loader, swapping the pragma can be an
option in mdx-loader as long as we have a Vue `createElement` to point
to.

* * *

Written by [Chris Biscardi](https://christopherbiscardi.com)

**[&lt; Back to blog](/blog)**
