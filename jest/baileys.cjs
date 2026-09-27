// Modified by NooviCrew. This file was changed from the upstream WAHA work (Apache License, Version 2.0, section 4(b)).
// Jest loads CommonJS. @adiwajshing/baileys is ESM and pulls the Wasm bridge,
// which has no require export. The unit tests that import it only need message
// unwrapping and the protocol enums used by src/core/utils/pwa.ts.

function normalizeMessageContent(content) {
  if (!content) {
    return undefined;
  }
  for (let i = 0; i < 5; i++) {
    const inner =
      content.ephemeralMessage ||
      content.viewOnceMessage ||
      content.documentWithCaptionMessage ||
      content.viewOnceMessageV2 ||
      content.viewOnceMessageV2Extension ||
      content.editedMessage ||
      content.associatedChildMessage ||
      content.groupStatusMessage ||
      content.groupStatusMessageV2 ||
      content.lottieStickerMessage;
    if (!inner) {
      break;
    }
    content = inner.message;
  }
  return content;
}

const proto = {
  Message: {
    ProtocolMessage: {
      Type: {
        HISTORY_SYNC_NOTIFICATION: 5,
        MESSAGE_EDIT: 14,
      },
    },
    SecretEncryptedMessage: {
      SecretEncType: {
        MESSAGE_EDIT: 2,
      },
    },
  },
};

module.exports = {
  normalizeMessageContent,
  proto,
};
