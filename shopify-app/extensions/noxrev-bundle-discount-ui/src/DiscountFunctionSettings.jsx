import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState} from "preact/hooks";

const FUNCTION_CONFIGURATION = {
  keyboardProductHandles: ["transparent-core-keyboard-case-ipad"],
  accessories: {
    "txp1-pencil": {percentage: 20},
    "txp1-mouse": {percentage: 20},
    "txp1-case": {percentage: 20},
    "txp1-charger": {percentage: 20},
    "tpx1-cable": {percentage: 20},
  },
};

export default async () => {
  render(<App />, document.body);
};

function App() {
  const [error, setError] = useState();
  const {applyMetafieldChange, discounts, i18n} = shopify;

  async function applySettings() {
    const classResult = await discounts?.updateDiscountClasses?.(["product"]);

    if (classResult && !classResult.success) {
      setError(i18n.translate("error"));
      return;
    }

    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app",
      key: "function-configuration",
      value: JSON.stringify(FUNCTION_CONFIGURATION),
      valueType: "json",
    });

    setError(undefined);
  }

  return (
    <s-function-settings
      onSubmit={(event) => {
        event.waitUntil?.(applySettings());
      }}
    >
      <s-heading>{i18n.translate("title")}</s-heading>

      <s-section>
        <s-stack gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}

          <s-paragraph>{i18n.translate("description")}</s-paragraph>

          <s-unordered-list>
            <s-list-item>{i18n.translate("keyboard")}</s-list-item>
            <s-list-item>{i18n.translate("accessories")}</s-list-item>
            <s-list-item>{i18n.translate("cap")}</s-list-item>
          </s-unordered-list>
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}
