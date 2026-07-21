# NoxRev automatic keyboard bundle discount

This directory contains a Shopify Discount Function app extension. It is separate from the theme because Shopify Functions can only be deployed by a Shopify app.

## Implemented behavior

- `transparent-core-keyboard-case-ipad` is the default keyboard parent.
- The five default accessory products are `txp1-pencil`, `txp1-mouse`, `txp1-case`, `txp1-charger`, and `tpx1-cable`.
- Each accessory defaults to 20% off, matching the existing storefront bundle copy.
- Each accessory product is capped independently by the total keyboard quantity.
- The cap is shared across multiple cart lines or variants of the same accessory product.
- No keyboard means no accessory discount.
- The Function returns a product discount operation with `selectionStrategy: ALL`, so every eligible accessory receives its configured percentage.
- The automatic discount requires no code and is calculated by Shopify in cart and checkout.

Examples:

- 1 keyboard + 2 mice → 1 mouse discounted.
- 2 keyboards + 3 mice → 2 mice discounted.
- 1 keyboard + 1 mouse + 1 stylus → 1 mouse and 1 stylus discounted.

## Local test

From this directory:

```sh
npm test
```

## Partner app and deployment

The app is linked to Shopify Partner organization `132842934`. Its committed configuration requests `read_products,write_discounts`; installation must approve those scopes.

Deploy from this directory:

```sh
npm install
npm test
shopify app build
shopify app deploy
```

After installing the app on the client store, create the automatic discount using `graphql/discountAutomaticAppCreate.graphql` and `graphql/discountAutomaticAppCreate.variables.json` in Shopify's Admin GraphiQL explorer while authenticated as this app.

The automatic discount title is `NoxRev keyboard bundle`. The included configuration sets all five accessories to 20%. Change any percentage in the activation variables before creation if required.

## Storefront display

No theme change is required. The current NoxRev theme already renders `line_level_discount_allocations` and `final_line_price` in both `sections/main-cart.liquid` and `sections/cart-drawer.liquid`. Shopify checkout renders the same automatic Function discount.
