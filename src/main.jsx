import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.jsx";
import { SessionProvider } from "./auth/SessionProvider.jsx";
import MissingClerkKey from "./auth/MissingClerkKey.jsx";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const root = ReactDOM.createRoot(document.getElementById("root"));

// Without a publishable key ClerkProvider throws on mount and the screen goes
// blank — a miserable way to discover a missing .env value. Render the setup
// instructions instead.
if (!PUBLISHABLE_KEY) {
  root.render(
    <React.StrictMode>
      <MissingClerkKey />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <SessionProvider>
          <App />
        </SessionProvider>
      </ClerkProvider>
    </React.StrictMode>
  );
}
