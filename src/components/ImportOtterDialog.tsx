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

export type OtterSpeech = {
  speech_id: string;
  title: string;
  created_at: number;
  summary: string;
  otid: string;
  id: string;
};
export type OtterSpeechInfo = {
  speech_id: string;
  title: string;
  created_at: number;
  summary: string;
  otid: string;
  id: string;
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

const offsetToTimestamp = (offset?: number) => {
  if (!offset) {
    return "00:00";
  }
  const totalSeconds = Math.round(offset / 16000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
};

const replaceDateSubstitutions = (text: string) =>
  text
    .replace(
      /{today}/gi,
      `[[${window.roamAlphaAPI.util.dateToPageTitle(new Date())}]]`
    )
    .replace(
      /{tomorrow}/gi,
      `[[${window.roamAlphaAPI.util.dateToPageTitle(addDays(new Date(), 1))}]]`
    );

export const DEFAULT_LABEL = `{title} - {summary} ({created-date})`;
export const DEFAULT_TEMPLATE = `{start} - {end} - {text}`;
export const importSpeech = ({
  credentials,
  id,
  order,
  parentUid,
  label,
  template,
  onSuccess,
  extensionAPI,
}: {
  credentials: { email: string; password: string };
  id: string;
  order: number;
  parentUid: string;
  label: string;
  template: string;
  onSuccess?: (id: string) => void;
  extensionAPI: OnloadArgs["extensionAPI"];
}): Promise<InputTextNode[]> =>
  apiPost<{
    title: string;
    summary: string;
    createdDate: number;
    link: string;
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

    console.log(recordingDate)

    const roamFormatDate = `[[${window.roamAlphaAPI.util.dateToPageTitle(recordingDate)}]]`
    console.log(roamFormatDate)

    let labelWithReplacements = label
      .replace(/{title}/gi, data.title || "Untitled")
      .replace(/{summary}/gi, data.summary)
      .replace(/{created-date(?::(.*?))?}/gi, (_, i) =>
        i
          ? format(new Date(data.createdDate * 1000), i)
          : new Date(data.createdDate * 1000).toLocaleString()
      )
      .replace(/{link}/gi, data.link);
      console.log(data);


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
        console.log(index)
        if (index ==0) {
          stringLine+=`**${line.speaker}**`
          stringLine+=":\n"
        }
        else {
          if (line.speaker !== transcriptLines[index-1].speaker) {
          stringLine+=`**${line.speaker}**`
          stringLine+=":\n"
          console.log("Going into one of the loops!")
          }
        }
        stringLine+=line.text
        listOfLines.push(stringLine)
        console.log(`String ${index}: ${stringLine}`)
      }
      return listOfLines.join("\n\n")
    }
    console.log("data.transcirpt: ", data.transcripts)
    console.log("Object.values(data.transcripts): ", Object.values(data.transcripts))

    const theTransciptAsOneBlock:String = buildTranscript(Object.values(data.transcripts))

    // const theTransciptAsOneBlock: String = Object.values(data.transcripts).map(t => t.text).join('\n\n');

    console.log(theTransciptAsOneBlock)

    function extractTimeFromDate (fullDateTime: Date) {
      const hours = fullDateTime.getHours()
      const minutes = String(fullDateTime.getMinutes()).padStart(2,'0')

      const formattedTime: string = `${hours}:${minutes}`;
      return formattedTime

    }

  

    const node = {
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
            {
              text: '{{[[TODO]]}} Moved as needed?',
        
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
    const ids =
      (extensionAPI.settings.get("ids") as Record<string, string>) || {};

    if (onSuccess) {
      return createBlock({
        parentUid,
        node,
        order,
      })
        .then(() =>
          extensionAPI.settings.set("ids", { ...ids, [id]: newBlockUid })
        )
        .then(() => onSuccess(id))
        .then(() => []);
    } else {
      extensionAPI.settings.set("ids", { ...ids, [id]: newBlockUid });
      return [node];
    }
  });

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
        .then((r) => {
          setInitialLoading(false);
          if (!isEnd) {
            setSpeeches([...speeches, ...r.speeches]);
            setLastLoad(r.lastLoad);
            setLastModified(r.lastModified);
            setIsEnd(r.isEnd);
          }
        })
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
    <Dialog
      isOpen={true}
      canEscapeKeyClose
      canOutsideClickClose
      title={"Import Otter Speech"}
      onClose={onDeleteClose}
      autoFocus={false}
      enforceFocus={false}
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

export const render = createOverlayRender<DialogProps>(
  "otter-import",
  ImportOtterDialog
);

export default ImportOtterDialog;
