//#region src/index.ts
/**
* Host half of a browser-only plugin. The page, its state, and its settings
* writes all live in the client bundle (`./client`); this entry exists because
* the Loader row is what makes the package active, and the client-module scan
* only reaches packages the profile loaded.
*/
/** Function-plugin id (Loader row id is `operating-context`). */
const name = "operating-context";
/**
* Claim the Loader row without contributing Host behavior.
*/
function apply() {}
//#endregion
export { apply, name };
