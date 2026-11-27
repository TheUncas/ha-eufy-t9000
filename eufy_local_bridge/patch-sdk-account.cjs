'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// Both the connector build and the HA image apply this to the same pinned SDK.
// A future HA dependency archive may already contain the corrected methods.
function patchAccount(sdk) {
  function edit(file, changes) {
    const path = join(sdk, file);
    let source = readFileSync(path, 'utf8');
    for (const [before, after] of changes) {
      if (source.split(after).length === 2) continue;
      if (source.split(before).length !== 2) throw Error('Unexpected account handling in ' + file);
      source = source.replace(before, () => after);
    }
    writeFileSync(path, source);
  }

  edit('http/api.js', [
    ['async request(request, withoutUrlPrefix = false) {',
     'async request(request, withoutUrlPrefix = false) {\n        const requestToken = this.token;'],
    [`if (error.response.statusCode === 401) {
                    this.invalidateToken();
                    logging_1.rootHTTPLogger.error("Status return code 401, invalidate token", {
                        status: error.response.statusCode,
                        statusText: error.response.statusMessage,
                    });
                    this.emit("close");
                }`,
     `if (!withoutUrlPrefix && error.response.statusCode === 401 && requestToken && requestToken === this.token) {
                    if (request.endpoint === "v2/passport/profile") {
                        this.invalidateToken();
                        this.emit("close");
                    } else if (this.connected && request.endpoint !== "v2/passport/login_sec") {
                        // A service can deny an otherwise valid account. Confirm against the profile once per minute.
                        if (!this.bridgeProfileCheck && Date.now() >= (this.bridgeNextProfileCheck ?? 0)) {
                            this.bridgeNextProfileCheck = Date.now() + 60000;
                            this.bridgeProfileCheck = this.getPassportProfile().finally(() => { this.bridgeProfileCheck = undefined; });
                        }
                        await this.bridgeProfileCheck;
                    }
                }`],
    ['if (!this.password) require("../bridge-session.cjs").invalidate();',
     'if (!this.password) require("../bridge-session.cjs").invalidate("account_rejected");'],
    ['if (!this.password && (isInvalidToken || isTokenExpired || !this.tokenExpiration)) {\n            require("../bridge-session.cjs").invalidate();',
     'if (!this.password && (isInvalidToken || isTokenExpired || !this.tokenExpiration)) {\n            require("../bridge-session.cjs").invalidate(isTokenExpired ? "session_expired" : undefined);'],
    [`logging_1.rootHTTPLogger.error("Data decryption error, invalidating session data and reconnecting...", {
                    error: (0, utils_2.getError)(error),
                    serverPublicKey: this.persistentData.serverPublicKey,
                });
                this.persistentData.serverPublicKey = this.SERVER_PUBLIC_KEY;
                this.invalidateToken();
                this.emit("close");`,
     `throw new error_2.ApiInvalidResponseError("Could not decrypt the eufy API response", { cause: error });`],
    ['const profile = this.decryptAPIData(result.data);',
     `const profile = this.decryptAPIData(result.data);
                        if (typeof profile?.user_id !== "string" || !profile.user_id ||
                            (this.persistentData.user_id && profile.user_id !== this.persistentData.user_id)) return null;`],
  ]);

  edit('http/megaApi.js', [
    ['if (this.authToken && resp.statusCode === 401 && parsed.code === 26084) require("../bridge-session.cjs").invalidate();',
     'if (this.authToken && resp.statusCode === 401 && parsed.code === 26084) require("../bridge-session.cjs").invalidate("session_revoked");'],
  ]);
  edit('eufysecurity.js', [
    ['if (!this.config.password) {\n                require("./bridge-session.cjs").invalidate();',
     'if (!this.config.password) {\n                require("./bridge-session.cjs").invalidate(mega.tokenExpiresAt && mega.tokenExpiresAt - 60 <= Date.now() / 1000 ? "session_expired" : undefined);'],
  ]);
}

module.exports = patchAccount;
if (require.main === module) patchAccount(join(process.cwd(), 'node_modules/eufy-security-client/build'));
