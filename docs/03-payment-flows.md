# 03 — Payment flows

Three ways to charge a buyer. All of them create a sale with `generate-sale`
against the seller's MPL, and all of them end with money in the same wallet.
What differs is **where the card number is typed**, and that determines how much
of the checkout you control.

| | Hosted page | Hosted Fields | Direct API |
|---|---|---|---|
| Card entered in | PayMe's page, in your iframe | PayMe's iframes, inside your form | nowhere — a token is charged |
| You control the look | no | yes | n/a |
| Card data touches your server | no | no | no |
| 3-D Secure handled by | PayMe | PayMe | n/a — already verified |
| Buyer present | yes | yes | **no** |
| Calls | `generate-sale` | `generate-sale` → browser tokenize → `pay-sale` | `generate-sale` → `pay-sale` |

All three keep your server out of card-data scope. The Direct API row is the odd
one out not because of compliance but because there is no buyer: it is how you
bill a returning customer, run a subscription, or take a back-office payment.

> There is a fourth possibility — sending a raw PAN to `pay-sale` — available
> only to PCI-compliant merchants. This app never does that, and neither should
> you unless you have already been through a PCI DSS audit and know why.

---

## Flow 1 — Hosted payment page (iframe or redirect)

The least work and the least control.

```
POST /generate-sale  →  { sale_url, payme_sale_id, payme_sale_code }
```

Put `sale_url` in an iframe, or redirect the buyer to it. PayMe renders the
form, validates the card, runs 3-D Secure where required, and takes the money.

```ts
const request: GenerateSaleRequest = {
  seller_payme_id: seller.paymeId,    // the SELLER's MPL, not yours
  sale_price: 7500,                   // minor units — 75.00
  currency: 'ILS',
  product_name: 'Ceramic mug',
  transaction_id: sale.id,            // YOUR order id, echoed back on callbacks
  installments: '1',
  sale_type: 'sale',                  // or 'authorize' — see 05
  sale_payment_method: 'credit-card', // or 'multi' to let the buyer choose
  language: 'en',
  sale_callback_url: '…',             // omitted when it would be localhost
  sale_return_url: '…',               // same
};
```

Sending the **marketplace's** MPL here instead of the seller's fails with
`Feature is not supported for this seller type` — a partner MPL cannot generate
sales.

**Pre-filling the form.** Append query parameters to `sale_url`:
`first_name`, `last_name`, `phone`, `email`, `social_id`, `zip_code`. Card
fields cannot be pre-filled, and invalid values are silently dropped.

**Payment methods.** `sale_payment_method` picks what the page offers:
`credit-card` (default), `bit`, `paypal`, `apple-pay`, `google-pay`,
`bank-transfer`, `sepa`, `bacs`, `il-direct-debit`, and `multi`, which shows
everything the seller has enabled and lets the buyer choose.

**The page adapts to the card.** Enter an Israeli card and the "Zip Code" field
becomes "Social ID". You neither control nor need to know about this — it is one
of the things you are buying by not building the form yourself.

### After payment: two signals, only one authoritative

The buyer is redirected to `sale_return_url` with the outcome appended:

```
?payme_status=success
&payme_signature=75e99dbcb25cdfbe1c62f0b9376f4144
&payme_sale_id=SALE…&payme_transaction_id=TRAN…
&price=10000&currency=ILS&transaction_id=your-order-id&is_token_sale=0
```

Separately, PayMe POSTs a signed callback to `sale_callback_url`.

**Fulfil on the callback, not the redirect.** The redirect is the buyer's own
browser: they can close the tab, lose connectivity, or hand-craft the URL. It is
fine — good, even — to render a receipt from it, which is what
`CheckoutReturn.tsx` does. It is not fine to ship goods from it.

Note how that page gets its status: it reads the sale back from our own API,
which only ever records "paid" from a verified callback or a synchronous
`pay-sale` response. The query string is displayed, not trusted.

---

## Flow 2 — Hosted Fields (JSAPI)

Your checkout, PayMe's inputs. Card number, expiry and CVV are iframes served
from `cdn.payme.io`, mounted into your own form and styled to match it. The
buyer sees your page; the card data goes browser → PayMe's vault.

```
1. server   POST /generate-sale                    → payme_sale_id
2. browser  PayMe.create(publicKey)
              .hostedFields() → create + mount
              .tokenize(saleData)                  → { token, card, … }
3. server   POST /pay-sale  buyer_key = token      → sale details
```

### Step 1 — reserve the sale

Identical to flow 1, minus `sale_payment_method`. You need the `payme_sale_id`
before the browser can do anything.

### Step 2 — tokenize in the browser

```html
<script src="https://cdn.payme.io/hf/v1/hostedfields.js"></script>
```

```js
const instance = await PayMe.create(sellerPublicKey, {
  testMode: true,          // sandbox — must match the sale's environment
  language: 'en',
  tokenIsPermanent: true,  // false for a single-use token
});

const fields = instance.hostedFields();
const cardNumber = fields.create('cardNumber', { styles, placeholder: '…' });
const expiration = fields.create('cardExpiration', { styles });
const cvv        = fields.create('cvc', { styles });

cardNumber.on('validity-changed', e => { /* e.isValid, e.message */ });
cardNumber.on('card-type-changed', e => { /* e.cardType: visa | mastercard | … */ });

await Promise.all([
  cardNumber.mount('#pm-card-number'),
  expiration.mount('#pm-card-expiry'),
  cvv.mount('#pm-card-cvv'),
]);

const result = await instance.tokenize({
  payerFirstName: 'Pay', payerLastName: 'Tester',
  payerEmail: 'buyer@example.com', payerPhone: '0501112233',
  payerSocialId: '008336174',
  total: { label: 'Ceramic mug', amount: { currency: 'ILS', value: '75.00' } },
});
// result.token  ← this is the buyer_key
```

**Things that will catch you out:**

- **`PayMe.create` takes the seller's PUBLIC key** — the uuid from
  `create-seller` or `GET /sellers/{mpl}/public-keys`. Never the partner key;
  that is a server credential, and shipping it in a bundle hands anyone the
  ability to create sellers on your account.

- **One instance, one tokenization.** Calling `tokenize()` twice on the same
  instance fails with `Bad session — Session expired or deleted`. After any
  failure you must tear the fields down and create a fresh instance from a fresh
  sale. `Checkout.tsx` remounts rather than retrying in place.

- **`total.amount.value` is a decimal string here** — `"75.00"`, not `7500`.
  This is the one place in PayMe's API that is not minor units. It drives only
  what the buyer sees inside PayMe's iframe; the amount actually charged is the
  one on the sale from step 1. Keep them in agreement, or the buyer sees one
  price and pays another.

- **Rule of thumb for payer fields:** any field you did not create and mount, you
  must supply as a value in `tokenize()`. Card number, expiry and CVV are the
  exception — those must always be mounted and can never be passed as values.

- **Containers need an explicit height.** A cross-origin iframe with no
  intrinsic content height collapses to nothing and the field looks like it
  failed to load. See the rule in `frontend/src/index.css`.

- **CSP.** If your site sets a Content-Security-Policy, `cdn.payme.io` needs to
  be in `script-src` and `frame-src`. PayMe's own CSP also produces harmless
  console errors from browser extensions; their docs say to ignore them.

### Step 3 — charge the token

`POST /pay-sale` with `buyer_key` set to `result.token`. Only the token crosses
your server boundary. The response is the full sale-details payload,
synchronously — the callback that follows is reinforcement, not news.

---

## Flow 3 — Direct API with a saved token

No UI, no buyer. `generate-sale` then `pay-sale`, both server-side, charging a
`buyer_key` captured earlier.

```ts
// 1. create the sale — note: NO capture_buyer
const created = await payme.request('generate-sale', { /* …, capture_buyer omitted */ });

// 2. charge the saved card
await payme.request('pay-sale', {
  seller_payme_id: seller.paymeId,
  payme_sale_id:   created.payme_sale_id,
  sale_price:      String(sale.priceMinor),   // a STRING on this endpoint
  currency:        sale.currency,
  installments:    '1',
  buyer_key:       token,
});
```

**`capture_buyer` and `buyer_key` are mutually exclusive.** You are either
tokenizing a new card on this sale or charging an existing token. A request
carrying both is rejected. `SalesService.chargeToken` deletes `capture_buyer`
explicitly for that reason.

**Note the type drift**: `generate-sale` wants `sale_price` as a *number*,
`pay-sale` wants it as a *string*. `payme.types.ts` types them separately rather
than smoothing it over, because the difference is real.

No 3-D Secure prompt appears — the card was verified when the token was
captured. That is exactly why this is the flow for subscriptions, one-click
repeat orders, and any charge that happens when nobody is at a keyboard.

---

## Choosing

- **Start with the hosted page.** One call, and it handles 3-D Secure and
  payment-method selection for you.
- **Move to Hosted Fields when the redirect hurts conversion**, or when the
  checkout has to look like the rest of your product.
- **Use the Direct API for anything without a buyer present.**

Nothing stops you offering all three, which is what this app does.

## Reading list in the code

- `backend/src/sales/sales.service.ts` — all three, with the shared request builder
- `backend/src/sales/dto/sale.dto.ts` — the inputs, with PayMe's constraints
- `frontend/src/lib/payme-hosted-fields.ts` — the JSAPI wrapper and its footguns
- `frontend/src/pages/Checkout.tsx` — the three implemented side by side
- `frontend/src/pages/CheckoutReturn.tsx` — why the redirect is not proof
