import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import "./styles/globals.css";
import App from "./App";
import { store } from "@/store/desktop-store";

if (import.meta.env.DEV) {
  Object.assign(window as Window & { __PI_REDUX_STORE__?: typeof store }, {
    __PI_REDUX_STORE__: store,
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
