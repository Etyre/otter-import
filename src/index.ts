import addBlockCommand from "roamjs-components/dom/addBlockCommand";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getPageTitleByBlockUid from "roamjs-components/queries/getPageTitleByBlockUid";
import registerSmartBlocksCommand from "roamjs-components/util/registerSmartBlocksCommand";
import runExtension from "roamjs-components/util/runExtension";
import {
  DEFAULT_LABEL,
  DEFAULT_TEMPLATE,
  importSpeech,
  OtterSpeech,
  render,
} from "./components/ImportOtterDialog";
import PasswordField from "./components/PasswordField";
import localStorageGet from "roamjs-components/util/localStorageGet";
import apiPost from "roamjs-components/util/apiPost";
import { render as renderToast } from "roamjs-components/components/Toast";
import { Intent } from "@blueprintjs/core";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import React from "react";

// Important hardcoded block info:

// let default_UIDofBlockWhereTransciptsGo: string
// This is an empty variable. We're going to define it later, via the settings pannel.
const default_UIDofBlockWhereTransciptsGo = "U9b9rcTGM"
const audioNotes_UIDofBlockWhereTransciptsGo = "aC2ApL4Ha"
const walkingJournal_UIDofBlockWhereTransciptsGo = "-zyCLNaaI"

export { audioNotes_UIDofBlockWhereTransciptsGo, walkingJournal_UIDofBlockWhereTransciptsGo}
// Exporting to import otter dialog

// This 👇 is the default function that roam calls when it loads the extention. 
// In this case, it's making a settings pannel.
export default runExtension(async (args) => {
  args.extensionAPI.settings.panel.create({
    tabTitle: "Otter",
    settings: [
      {
        id: "email",
        description: "The email tied to your Otter account",
        name: "Email",
        action: { type: "input", placeholder: "support@roamjs.com" },
      },
      {
        id: "password",
        description: "The password needed to access your Otter account",
        name: "Password",
        action: {
          type: "reactComponent",
          component: () => React.createElement(PasswordField),
        },
      },
      {
        action: { type: "input", placeholder: "U9b9rcTGM" },
        id: "default-parent-block",
        description: "The place where your transcripts will show up (unless you did some silly hardcoding)",
        name: "Default Parent Block",
      },
      {
        action: { type: "input", placeholder: DEFAULT_LABEL },
        id: "label",
        description: "The format labels use on import",
        name: "Import Label",
      },
      {
        action: { type: "input", placeholder: DEFAULT_TEMPLATE },
        id: "template",
        description: "The format each Otter note/transcript uses on import",
        name: "Import Template",
      },
      {
        action: { type: "switch" },
        id: "auto-import",
        description: "Automatically imports the latest recording when checked",
        name: "Auto Import Enabled",
      },
    ],
  });

  // default_UIDofBlockWhereTransciptsGo = args.extensionAPI.settings.get("default-parent-block")


  // This adds a command to the Roam command pallet.
  addBlockCommand({
    label: "Import Otter",
    callback: (blockUid) =>
      render({ blockUid, extensionAPI: args.extensionAPI }),
  });

  // 👇 This is a legacy function. We've got a better alternative now.
  // function filterOutToday(timeStampInSeconds: number) {
  //   const currentDate = Date.now()/1000

  //   if (currentDate >= timeStampInSeconds + 86400){
  //     return true
  //   }else{
  //     return false
  //   }
  // }

  //This is the function that we'll run on refresh. It imports the most recent n recordings?
  const autoImportRecordings = (
    parentUid: string,
    onSuccess?: (id: string) => void
  ) => {
    console.log("we're going into the autoImportRecordings function")
    console.log("default_UIDofBlockWhereTransciptsGo is: ",default_UIDofBlockWhereTransciptsGo)
    const email = (args.extensionAPI.settings.get("email") as string) || "";
    const password = localStorageGet("otter-password");
    const label =
      (args.extensionAPI.settings.get("label") as string) || DEFAULT_LABEL;
    const template =
      (args.extensionAPI.settings.get("template") as string) ||
      DEFAULT_TEMPLATE;
    return apiPost<{ speeches: OtterSpeech[] }>({
      domain: "https://api.samepage.network",
      path: `extensions/otter/speeches`,
      data: {
        email,
        password,
        operation: "GET_SPEECHES",
        params: { pageSize: 10 },
      },
    }).then((r) => {
      const ids =
        (args.extensionAPI.settings.get("ids") as Record<string, string>) || {};
      const importedIds = new Set(Object.keys(ids));
      const bottom = getChildrenLengthByPageUid(parentUid);
      console.log(r)
      return Promise.all(
        r.speeches
          // .filter((s) => !importedIds.has(s.id))
          .filter((s) => s.isProcessed)
          // .sort(((a, b) => a - b))
          // I know that there's an error in the line above, but this line works and the line that it recommends doesn't work.
          .map((s, i) =>
            importSpeech({
              credentials: { email, password },
              id: s.id,
              label,
              template,
              onSuccess,
              extensionAPI: args.extensionAPI,
              parentUid,
              order: bottom + i,
              manualImport: false,
            })
          )
      ).then((r) => r.flat());

    });
  };



  // note that there was previously a typo here here "auto-import" was missing the "-"
  if (args.extensionAPI.settings.get("auto-import")) {
    console.log("autoimport is enabled and running")
    const dateName = window.roamAlphaAPI.util.dateToPageTitle(new Date());
    autoImportRecordings(default_UIDofBlockWhereTransciptsGo, (id) =>
      renderToast({
        id: "otter-auto-import",
        content: `Successfully imported otter recording: ${id}!`,
        intent: Intent.SUCCESS,
      })
    ).then((count) =>
      renderToast({
        id: "otter-auto-import",
        content: `Successfully imported ${count} latest otter recordings automatically at block on your graph!`,
        intent: Intent.SUCCESS,
      })
    );
  }

  // This allows for creating a smart block command that runs the autoimport function.
  registerSmartBlocksCommand({
    text: "OTTER",
    handler: (context: { targetUid: string }) => () =>
      autoImportRecordings(
        getPageUidByPageTitle(getPageTitleByBlockUid(context.targetUid)) ||
          context.targetUid
      ),
  });

  // Exposes the functions in the autoimport to the window (which is visible in the console). 
  // This allows this extention to talk to other code running on the graph.
  window.roamjs.extension.otter = {
    importOtter: (
      parentUid = window.roamAlphaAPI.util.dateToPageUid(new Date())
    ) => autoImportRecordings(parentUid),
  };
});
