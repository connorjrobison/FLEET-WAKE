# WAKE Navy Style Kit

This kit packages WAKE's reusable visual language for similar operational
dashboard applications. It does not modify or become a dependency of the
single-file WAKE application.

## Files

- `wake-navy-tokens.css` contains the light/dark palette, typography, shape,
  shadows, exact four-level blue gradients, and operational status colors.
- `wake-navy-components.css` contains namespaced app-shell, navigation, card,
  metric, button, level, status, table, form, responsive, and print styles.
- `example.html` demonstrates the components and a minimal theme toggle.

## Add The Styles

Load the token sheet first:

```html
<link rel="stylesheet" href="wake-navy-tokens.css">
<link rel="stylesheet" href="wake-navy-components.css">
```

Add the app scope to the body:

```html
<body class="navy-app">
```

Enable dark mode by setting `data-theme="dark"` on the root element:

```js
document.documentElement.dataset.theme = "dark";
```

Remove the attribute or set it to `light` to return to the light theme.

## Semantic Color Rules

- Foundational through Level 3 always use the shared light-to-dark blue
  progression.
- Currency loss uses `.navy-status--danger` and remains bright red.
- Proficiency loss or Need Currency uses `.navy-status--warning` and remains
  bright yellow.
- Approaching level-up uses `.navy-status--levelup` and remains darker green.
- Gold is a quiet brand accent only. Do not use it to communicate status.
- There is intentionally no gold rail on normal content cards or Start Here
  sections.

## Common Components

```html
<section class="navy-card">
  <h2 class="navy-card__header">Section title</h2>
  <button class="navy-button">Primary action</button>
</section>

<span class="navy-badge navy-level--2">Level 2</span>

<aside class="navy-status navy-status--warning">
  Proficiency loss
</aside>
```

All selectors are prefixed with `navy-`, and the base application rules are
scoped through `body.navy-app`, which reduces conflicts when adopting the kit
in an existing application.
