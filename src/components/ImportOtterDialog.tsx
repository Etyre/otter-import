import {
  Button,
  Classes,
  Dialog,
  Intent,
  Radio,
  RadioGroup,
  Spinner,
  SpinnerSize,
} from "@blueprintjs/core";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import getOrderByBlockUid from "roamjs-components/queries/getOrderByBlockUid";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import format from "date-fns/format";
import addDays from "date-fns/addDays";
import localStorageGet from "roamjs-components/util/localStorageGet";
import apiPost from "roamjs-components/util/apiPost";
import type { InputTextNode, OnloadArgs } from "roamjs-components/types";

import  { default_UIDofBlockWhereTransciptsGo, walkingJournal_UIDofBlockWhereTransciptsGo, audioNotes_UIDofBlockWhereTransciptsGo } from "../index";

// Here we're defining two types, which match the Same Page API that we can use later.
export type OtterSpeech = {
  speech_id: string;
  title: string;
  created_at: number;
  summary: string;
  otid: string;
  id: string;
  isProcessed: boolean;
  folder?: {
    id: number;
    name: string;
  } | null
};
export type OtterSpeechInfo = {
  speech_id: string;
  title: string;
  created_at: number;
  summary: string;
  otid: string;
  id: string;
  folder?: {
    id: number;
    name: string;
  } | null
  transcripts: {
    transcript: string;
    start_offset: number;
    end_offset: number;
    speaker_id: string;
  }[];
  speakers: { speaker_id: string; speaker_name: string; id: string }[];
};

type DialogProps = {
  blockUid: string;
  extensionAPI: OnloadArgs["extensionAPI"];
};

// These are two legacy functions that we're not using any more.

// const offsetToTimestamp = (offset?: number) => {
//   if (!offset) {
//     return "00:00";
//   }
//   const totalSeconds = Math.round(offset / 16000);
//   const seconds = totalSeconds % 60;
//   const minutes = Math.floor(totalSeconds / 60);
//   return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
// };

// const replaceDateSubstitutions = (text: string) =>
//   text
//     .replace(
//       /{today}/gi,
//       `[[${window.roamAlphaAPI.util.dateToPageTitle(new Date())}]]`
//     )
//     .replace(
//       /{tomorrow}/gi,
//       `[[${window.roamAlphaAPI.util.dateToPageTitle(addDays(new Date(), 1))}]]`
//     );

export const DEFAULT_LABEL = `{title} - {summary} ({created-date})`;
export const DEFAULT_TEMPLATE = `{start} - {end} - {text}`;

// This is the core function of this extension. 
// It grabs the details of a otter recording from the Same Page API.
export const importSpeech = ({
  credentials,
  id,
  order,
  parentUid,
  label,
  template,
  onSuccess,
  extensionAPI,
  manualImport=true,
  //This argument tells if we're calling the function as part of autoImportRecordings or as part of the command pallet addBlockCommand
}: {
  credentials: { email: string; password: string };
  id: string;
  order: number;
  parentUid: string;
  label: string;
  template: string;
  onSuccess?: (id: string) => void;
  extensionAPI: OnloadArgs["extensionAPI"];
  manualImport?: boolean
}): Promise<InputTextNode[]> =>
  apiPost<{
    title: string;
    summary: string;
    createdDate: number;
    link: string;
    folder?: {
      id: number;
      name: string;
    } | null
    transcripts: {
      start: number;
      end: number;
      text: string;
      speaker: string;
    }[];
  }>({
    domain: "https://api.samepage.network",
    path: `extensions/otter/speeches`,
    data: {
      ...credentials,
      operation: "GET_SPEECH",
      params: { id },
    },
  }).then((data) => {
    const newBlockUid = window.roamAlphaAPI.util.generateUID();
    const recordingDate = new Date(data.createdDate * 1000)

    const roamFormatDate = `[[${window.roamAlphaAPI.util.dateToPageTitle(recordingDate)}]]`

    // This is the functionality that takes the template, and fills it in with the data returned from the 
    // API. My version, doesn't use this.
    // let labelWithReplacements = label
    //   .replace(/{title}/gi, data.title || "Untitled")
    //   .replace(/{summary}/gi, data.summary)
    //   .replace(/{created-date(?::(.*?))?}/gi, (_, i) =>
    //     i
    //       ? format(new Date(data.createdDate * 1000), i)
    //       : new Date(data.createdDate * 1000).toLocaleString()
    //   )
    //   .replace(/{link}/gi, data.link);

      // console.log(data);

    // This is basically appending a bunch of lines together.
    function buildTranscript (transcriptLines: Array<{
      start: number;
      end: number;
      text: string;
      speaker: string;}>) {
      var listOfLines = []
      console.log("Entered the buildTranscript function!")
      for (let index = 0; index < transcriptLines.length; index++) {
        const line = transcriptLines[index];
        var stringLine = ""
        // console.log(index)
        if (index ==0) {
          stringLine+=`${line.speaker}`
          stringLine+=":\n"
        }
        else {
          if (line.speaker !== transcriptLines[index-1].speaker) {
          stringLine+=`${line.speaker}`
          stringLine+=":\n"
          }
        }
        stringLine+=line.text
        listOfLines.push(stringLine)
      }
      return listOfLines.join("\n\n")
    }

    // Calling the function above.
    const theTransciptAsOneBlock:String = buildTranscript(Object.values(data.transcripts))

    function extractTimeFromDate (fullDateTime: Date) {
      const hours = fullDateTime.getHours()
      const minutes = String(fullDateTime.getMinutes()).padStart(2,'0')

      const formattedTime: string = `${hours}:${minutes}`;
      return formattedTime
    }

    // These are our node templates
    const defaultNode = {
      uid: newBlockUid,
      text: roamFormatDate,
      children: [{
        text: "[[Automated transcirpt from otter]]",
        children: [
          {
          text: 'Recroding Metadata',
          children: [
            {
              text: 'Date:: '+ roamFormatDate,
              
            },
            {
              text: 'Start time:: '+ extractTimeFromDate(recordingDate),
              // recordingDate
            
            },
            // {
            //   text: 'Folder:' +data.folder,
            // },
            {
              text: 'Otter Link:: '+data.link,

            },

          ],
        },
        { text: "{{[[TODO]]}} [[Transcricpt]]", 
          children: [ {text: theTransciptAsOneBlock}]
        }
      ],
      }
    ],
    };

    const audioNotesNode = {
      uid: newBlockUid,
      text: roamFormatDate,
      children: [{
        text: "[[Automated transcirpt from otter]] #[[transcribed verbal notes]]",
        children: [
          {
          text: 'Recroding Metadata',
          children: [
            {
              text: 'Date:: '+ roamFormatDate,
              
            },
            {
              text: 'Start time:: '+ extractTimeFromDate(recordingDate),
              // recordingDate
            
            },
            // {
            //   text: 'Folder:' +data.folder,
            // },
            {
              text: 'Otter Link:: '+data.link,

            },
            {
              text: 'Source::',
        
            },
          ],
        },
        { text: "{{[[TODO]]}} [[Transcricpt]]", 
          children: [ {text: theTransciptAsOneBlock}]
        }
      ],
      }
    ],
    };

    const walkingJournalNode = {
      uid: newBlockUid,
      text: `${roamFormatDate} #[[Walking Journal]]`,
      children: [{
        text: "[[Automated transcirpt from otter]]",
        children: [
          {
          text: 'Recroding Metadata',
          children: [
            {
              text: 'Date:: '+ roamFormatDate,
              
            },
            {
              text: 'Start time:: '+ extractTimeFromDate(recordingDate),
              // recordingDate
            
            },
            // {
            //   text: 'Folder:' +data.folder,
            // },
            {
              text: 'Otter Link:: '+data.link,

            },
  
          ],
        },
        { text: "{{[[TODO]]}} [[Transcricpt]]", 
          children: [ {text: theTransciptAsOneBlock}]
        }
      ],
      }
    ],
    };

    let node = defaultNode

    // This is a dictionary where we store all the otter ids of recordings that haven been imported.
    const ids =
      (extensionAPI.settings.get("ids") as Record<string, string>) || {};

    // If the onSuccess function is passed into this whole import speach function, then we do some stuff.
    // First, we check if this is a manual or an automatic import. IFF it's an automatic import, we check the otter folder of the recording, and set the node template depending.
    if (onSuccess) {
      console.log("This is the parentUid: ",parentUid)
      if (manualImport == false) {
        console.log("This is an autoimprt")
        if (data.folder !== null){
          // check if this is in the walking journal folder
          if (data.folder.id == 1072467) {
            parentUid = walkingJournal_UIDofBlockWhereTransciptsGo
            node = walkingJournalNode
          // check if this is in the audio notes folder
          }else if(data.folder.id == 961073) {
            parentUid = audioNotes_UIDofBlockWhereTransciptsGo
            node = audioNotesNode
          }
        }
      }
      //Second, we create a block on the graph.
      return createBlock({
        parentUid,
        node,
        order,
      })
        //Third, we update the list of otter ids.
        .then(() =>
          extensionAPI.settings.set("ids", { ...ids, [id]: newBlockUid })
        )
        // Fourth, we call the onSuccess function, which does <unknown>.
        .then(() => onSuccess(id))
        // Fifth, this weird thing. I don't know what this is or why it's there.
        // Guess: this is so that, if this fails, there's still an (empty) list that we can run checksums against.
        .then(() => []);
    } 
    // I don't know what this else block is doing.
    else {
      extensionAPI.settings.set("ids", { ...ids, [id]: newBlockUid });
      return [node];
    }
  });

// This is a react component, of window from which you you can select recording manually.
const ImportOtterDialog = ({
  onClose,
  blockUid,
  extensionAPI,
}: {
  onClose: () => void;
} & DialogProps) => {
  const { otterCredentials, label, template } = useMemo(() => {
    const email = (extensionAPI.settings.get("email") as string) || "";
    const password = localStorageGet("otter-password");
    const label =
      (extensionAPI.settings.get("label") as string) || DEFAULT_LABEL;
    const template =
      (extensionAPI.settings.get("template") as string) || DEFAULT_TEMPLATE;
    return { otterCredentials: { email, password }, label, template };
  }, []);
  const [speeches, setSpeeches] = useState<OtterSpeech[]>([]);
  const [value, setValue] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [lastLoad, setLastLoad] = useState(0);
  const [lastModified, setLastModified] = useState(0);
  const [isEnd, setIsEnd] = useState(false);

  // When you open the otter dialog, this does an api call to get the list of transcripts.
  useEffect(() => {
    if (initialLoading) {
      setError("");
      apiPost<{
        speeches: OtterSpeech[];
        lastLoad: number;
        lastModified: number;
        isEnd: boolean;
      }>({
        domain: "https://api.samepage.network",
        path: `extensions/otter/speeches`,
        data: {
          ...otterCredentials,
          operation: "GET_SPEECHES",
          params: { lastLoad, lastModified },
        },
      })
        // r is the thing being returned. r for "result", probably.
        .then((r) => {
          console.log(r)
          setInitialLoading(false);
          if (!isEnd) {
            setSpeeches([...speeches, ...r.speeches]);
            setLastLoad(r.lastLoad);
            setLastModified(r.lastModified);
            setIsEnd(r.isEnd);
          }
        })
        // error catching for if the API call fails.
        .catch((e) => {
          setError(e.response?.data || e.message);
          setInitialLoading(false);
        });
    }
  }, [
    setSpeeches,
    lastLoad,
    lastModified,
    speeches,
    isEnd,
    setLastModified,
    setLastLoad,
    setIsEnd,
    setInitialLoading,
    initialLoading,
    setError,
  ]);
  const onDeleteClose = useCallback(() => {
    onClose();
    deleteBlock(blockUid);
  }, [blockUid, onClose]);
  return (
    // This is the description of the dialog box.
    <Dialog
      isOpen={true}
      canEscapeKeyClose
      canOutsideClickClose
      title={"Import Otter Speech"}
      onClose={onDeleteClose}
      autoFocus={false}
      enforceFocus={false}
      style={{width:"600px"}}
    >
      <div className={Classes.DIALOG_BODY}>
        <RadioGroup
          selectedValue={value}
          onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        >
          {speeches.slice(page, page + 10).map((s) => (
            <Radio
              value={s.id}
              key={s.id}
              labelElement={
                <span>
                  <b>{s.title || "Untitled"}</b> -{" "}
                  <span style={{ fontWeight: 400 }}>{s.summary}</span>{" "}
                  <span style={{ fontSize: 8, fontWeight: 400 }}>
                    ({new Date(s.created_at * 1000).toLocaleString()})
                  </span>
                </span>
              }
            />
          ))}
        </RadioGroup>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Button
            text={"Previous"}
            disabled={page === 0}
            onClick={() => setPage(page - 10)}
          />
          <Button
            text={"Next"}
            disabled={isEnd && page + 10 >= speeches.length}
            onClick={() => {
              setPage(page + 10);
              if (!isEnd && page + 10 >= speeches.length) {
                setInitialLoading(true);
              }
            }}
          />
        </div>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          {(loading || initialLoading) && <Spinner size={SpinnerSize.SMALL} />}
          <span style={{ color: "darkred" }}>{error}</span>
          <Button
            disabled={loading || !value}
            text={"Import"}
            intent={Intent.PRIMARY}
            onClick={() => {
              setLoading(true);
              importSpeech({
                credentials: otterCredentials,
                id: value,
                parentUid: getParentUidByBlockUid(blockUid),
                label,
                template,
                onSuccess: onDeleteClose,
                extensionAPI,
                order: getOrderByBlockUid(blockUid),
              });
            }}
          />
        </div>
      </div>
    </Dialog>
  );
};

// We're exporting the popup.
// We constructed ImportOtterDialog, which is formatted for createOverlayRender.
// createOverlayRender is a a wraper function for creating popup dialogs that returns type DialogProps. 
export const render = createOverlayRender<DialogProps>(
  "otter-import",
  ImportOtterDialog
);

export default ImportOtterDialog;
// Here 👆 we're exporting this react component. 

// It's unclear why we're exporting both of these at this time.

