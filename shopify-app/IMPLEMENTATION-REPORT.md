# NoxRev Shopify Discount Function implementation report

Date: 2026-07-21

## Deployment

- Partner organization: `132842934` (`CrystalLions`)
- App: `noxrev-bundle-discount`
- Released version: `noxrev-bundle-20-v1`
- Shopify app ID: `400396320769`
- Shopify version ID: `1058772746241`
- Function API version: `2026-04`
- Function handle: `noxrev-bundle-discount`
- Status: app version deployed and released; client-store installation and automatic-discount creation remain pending.

## Implemented behavior

- Keyboard bundle parent: `transparent-core-keyboard-case-ipad`.
- Accessory bundle items: `txp1-pencil`, `txp1-mouse`, `txp1-case`, `txp1-charger`, and `tpx1-cable`.
- Every accessory receives a flat 20% product discount when a keyboard is present.
- Each accessory product has its own quantity cap equal to the total keyboard quantity.
- The cap is shared across multiple cart lines or variants of the same accessory product.
- Multiple keyboard lines and variants are summed before calculating caps.
- No keyboard means no accessory discount.
- Unrelated cart items are ignored.
- The Function emits `productDiscountsAdd` with `selectionStrategy: ALL`, allowing every eligible accessory to receive its discount.
- Shopify calculates the automatic discount in cart and checkout; no coupon code is required.

Examples verified by tests:

- 1 keyboard + 2 mice: 1 mouse discounted.
- 2 keyboards + 3 mice: 2 mice discounted.
- 1 keyboard + 2 of each of the five accessories: 1 unit of every accessory discounted at 20%.

## Code and configuration

- `shopify.app.toml`: links the Partner app and requests only `read_products,write_discounts`.
- `extensions/noxrev-bundle-discount/shopify.extension.toml`: registers one `cart.lines.discounts.generate.run` Function target and its WASM output.
- `extensions/noxrev-bundle-discount/src/cart_lines_discounts_generate_run.graphql`: requests cart quantities, variant product handles, available discount classes, and the app-owned JSON configuration metafield.
- `extensions/noxrev-bundle-discount/src/cart_lines_discounts_generate_run.js`: contains the keyboard aggregation, per-accessory caps, 20% candidates, and configuration validation.
- `extensions/noxrev-bundle-discount/src/cart_lines_discounts_generate_run.test.js`: contains ten behavior tests, including both requested examples and all five accessories.
- `graphql/discountAutomaticAppCreate.graphql`: creates the automatic app discount after installation.
- `graphql/discountAutomaticAppCreate.variables.json`: supplies the Function handle, product discount class, no-combination policy, and all five 20% rules.
- `package.json` and `package-lock.json`: provide reproducible Shopify CLI, Function build, and test commands.

## Theme impact

No theme files were changed for this Function. The existing theme already renders `line_level_discount_allocations` and `final_line_price` in both `sections/main-cart.liquid` and `sections/cart-drawer.liquid`, so Shopify's automatic discount will be visible there after activation. Checkout renders the Function discount natively.

## Verification performed

- `npm test`: 10 passed, 0 failed.
- `shopify app build`: passed; GraphQL types generated and JavaScript compiled to Function WASM.
- `shopify app deploy`: passed Shopify validation and released `noxrev-bundle-20-v1`.
- `shopify app info`: confirms the linked app, function component, npm package manager, and `read_products,write_discounts` scopes.

## Deferred until client-store installation

1. Install the Partner app on the client's Shopify store and approve its scopes.
2. Run `graphql/discountAutomaticAppCreate.graphql` with `graphql/discountAutomaticAppCreate.variables.json` while authenticated to that store as this app.
3. Confirm Shopify returns no `userErrors` and the automatic discount status is active.
4. Perform storefront QA with the real keyboard and accessory variants in cart and checkout.
5. If any product handle changes, update the app-owned configuration metafield (and the default configuration for future installs).

## Tooling note

`npm install` reported transitive audit advisories in the Shopify CLI/tooling dependency tree. No automatic dependency rewrite was applied because it could change the generated toolchain outside this Function's scope; the deployed WASM Function has no Node.js runtime dependency.
