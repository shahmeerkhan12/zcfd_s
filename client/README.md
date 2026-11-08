# Spoon — food delivery demo

Describe what you’re craving, choose a dish, enter a delivery address, and receive a demo tracking number.

## Run locally

In the first terminal, from `server`:

```sh
npm install
npm run dev
```

In a second terminal, from `client`:

```sh
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express server at `http://localhost:3000`.
If the backend runs on a different port, start Vite with `API_PROXY_TARGET=http://127.0.0.1:3001 npm run dev`.

## Sign in

Firebase Authentication sends an email sign-in link. Open the link and confirm the email address to sign in. When the link is opened on another device, enter the same email address there. Firebase stores the account; the browser SDK stores its session. Authenticator setup is not required.

1. Create a Firebase project and register a web app. Copy its web configuration to the ignored `client/.env` using `client/.env.example`. The web API key identifies the project and is not a service-account secret; never put service-account keys in the frontend.
2. In Firebase Authentication, enable **Email/Password** and **Email link (passwordless sign-in)**. Add the frontend domain under Authentication → Settings → Authorized domains. New projects do not authorize `localhost` automatically.
3. Restart Vite after setting the variables. Open the configured frontend origin and request a link. Firebase must be reachable and its email sending quotas apply. Use HTTPS for deployed sites.

This is a demo identity UI, not authorization for the ordering API: existing orders are not associated with users, and the backend does not verify Firebase tokens. Do not treat demo endpoints as protected. Accounts that already have MFA enrolled require a separate supported MFA sign-in or recovery flow.

## Nearby restaurants

The map asks the browser for the user's location and sends its coordinates to Google Maps in an iframe search for restaurants. Geolocation requires permission and HTTPS or localhost; the reported accuracy is an estimate. This uses no Google Places API key or backend restaurant search.

If precise location is unavailable or times out, the app retries with approximate location and may use a recent cached position. Location services and network access may still be necessary even when browser permission is granted; failures can be retried.

Google controls the map search results and iframe availability. The iframe does not expose restaurant coordinates to the app, so there is no graph search or guarantee that the closest restaurant is selected. The map does not establish Glovo participation, menu contents, or delivery availability. The existing menu and checkout remain a separate demo.

## Demo behavior

- The startup menu is shown initially and immediately when the search field is cleared. Search runs when the form is submitted; clearing the field ignores any pending search response.
- During a search, the button shows a loading spinner and a status message appears below the form. The indicators follow the existing request state and do not add a delay or extra requests; the server may use its local fallback instead of AI.
- Dish searches accept terms in a limited food dictionary (English, Ukrainian and Russian). Unrecognized queries return no match. The existing restaurant search can still generate demo dishes for recognized requests.
- The startup menu contains only dishes from `server/data-mock/menu.js`. Older generated dishes remain in the database but are hidden from the menu and cannot be ordered.
- Generated search dishes and their orders are kept in server memory and disappear when the server restarts. Orders for startup-menu dishes are stored in SQLite.
- Select individual dishes or all dishes in the cart to create one demo order. Orders containing multiple dishes are kept in server memory and disappear on restart; single startup-menu orders still use SQLite.
- The cart is saved in browser localStorage and restored on reload, with its items initially selected. Generated dishes can expire when the server restarts; remove unavailable dishes or search for them again. Checkout validates availability and prices on the server.
- Generated food images rotate through finite category-specific photo pools. Each category has at least three photos, so images repeat once the pool is exhausted; photos are illustrative, not exact representations of generated ingredients.
- Payment methods are for demonstration only. Card details are never requested and no money is charged.
- Tracking numbers and courier status updates are simulated; this is not a real delivery service.
- Menu prices are displayed in US dollars.

## Checks

```sh
# client
npm run build
npm run lint

# server
npm test
```
