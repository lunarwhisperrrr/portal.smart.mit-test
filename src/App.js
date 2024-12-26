import React, { useState, useEffect, useRef } from "react";

import { LoremIpsum } from "lorem-ipsum";

import { firebase } from "./firebase/firebase";

const lorem = new LoremIpsum({
  sentencesPerParagraph: {
    max: 8,
    min: 4,
  },
  wordsPerSentence: {
    max: 16,
    min: 4,
  },
});

const names = ["Iman", "Daniela", "Pooja", "Amit"];
const authenticatedUser = "Iman";
const messagesNum = 25;
const messageIds = Array.from({ length: messagesNum }, (_, i) => "M" + i);

// let firstTime = true;

export default function App() {
  const [messages, setMessages] = useState({});
  const inited = useRef(false);
  // const [userTotalVotes, setUserTotalVotes] = useState(0);
  const userTotalVotes = Object.keys(messages).reduce(
    (acc, key) => acc + messages[key].totalVotes,
    0
  );

  // Generate some messages and votes in the database to start with.
  useEffect(() => {
    const generateMessages = async () => {
      console.log("generateMessages");
      const totalMVotes = {};
      const mVoteDocs = await firebase.db.collection("mVotes").get();
      console.log({ mVotesNum: mVoteDocs.docs.length });
      if (mVoteDocs.docs.length === 0) {
        await Promise.all(
          messageIds.map(async (messageId) => {
            await Promise.all(
              names.map(async (name) => {
                const userVote = Math.random() < 0.5;

                const voteRef = firebase.db.collection("mVotes").doc();
                firebase.batchSet(voteRef, {
                  messageId,
                  name,
                  userVote,
                  dateTime: firebase.firestore.Timestamp.fromDate(new Date()),
                });
              })
            );
          })
        );
      }
      const messageDocs = await firebase.db.collection("messages").get();
      console.log({ messagesNum: messageDocs.docs.length });
      if (messageDocs.docs.length === 0) {
        await Promise.all(
          messageIds.map(async (messageId) => {
            const sender = names[Math.floor(Math.random() * names.length)];
            const messageRef = firebase.db
              .collection("messages")
              .doc(messageId);
            firebase.batchSet(messageRef, {
              sender,
              message: lorem.generateSentences(1),
              dateTime: firebase.firestore.Timestamp.fromDate(new Date()),
            });
          })
        );
      }
      await firebase.commitBatch();
      console.log("Created all the messages and votes documents.");
    };

    generateMessages();
  }, []);

  // Snapshot listeners to retrieve and combine the data
  useEffect(() => {
    const messagesQuery = firebase.db.collection("messages");
    const messagesSnapshot = messagesQuery.onSnapshot((snapshot) => {
      const docChanges = snapshot.docChanges(); // Get doc changes
      console.log("Changes:", docChanges);
      setMessages((oldMessages) => {
        const oMessages = { ...oldMessages };
        docChanges.forEach((change) => {
          if (change.doc.id in oMessages) {
            oMessages[change.doc.id] = {
              ...oMessages[change.doc.id],
              ...change.doc.data(),
            };
          } else {
            oMessages[change.doc.id] = change.doc.data();
          }
        });
        return oMessages;
      });
    });

    return () => messagesSnapshot();
  }, []);

  useEffect(() => {
    const votesQuery = firebase.db
      .collection("mVotes")
      .where("voter", "==", authenticatedUser);
    const votesSnapshot = votesQuery.onSnapshot((snapshot) => {
      const docChanges = snapshot.docChanges();
      console.log("vote Changes", docChanges);
      setMessages((oldMessages) => {
        const oMessages = { ...oldMessages };
        docChanges.forEach((change) => {
          const voteData = change.doc.data();
          const changeType = change.type;
          if (voteData.messageId in oMessages) {
            oMessages[voteData.messageId] = {
              ...oMessages[voteData.messageId],
              voter: voteData.voter,
              userVote: voteData.userVote,
              totalVotes:
                oMessages[voteData.messageId].totalVotes +
                (voteData.userVote ? 1 : changeType === 'added' ? 0 : -1),
            };
          } else {
            oMessages[voteData.messageId] = {
              voter: voteData.voter,
              userVote: voteData.userVote,
            };
          }
        });
        return oMessages;
      });
    });
    inited.current = true;
    return () => votesSnapshot();
  }, []);

  const upVote = (mId) => async () => {
    console.log(`Upvoting message ${mId}...`);
    const messageRef = firebase.db.collection("messages").doc(mId);
    await firebase.db.runTransaction(async (t) => {
      const messageDoc = await t.get(messageRef);
      if (messageDoc.exists) {
        const mVoteDocs = await firebase.db
          .collection("mVotes")
          .where("messageId", "==", mId)
          .where("voter", "==", authenticatedUser)
          .get();
        if (mVoteDocs.docs.length > 0) {
          const voteData = mVoteDocs.docs[0].data();
          const mVoteRef = firebase.db
            .collection("mVotes")
            .doc(mVoteDocs.docs[0].id);
          t.update(mVoteRef, {
            userVote: !voteData.userVote,
            dateTime: firebase.firestore.Timestamp.fromDate(new Date()),
          });
        } else {
          const mVoteRef = firebase.db.collection("mVotes").doc();
          t.set(mVoteRef, {
            messageId: mId,
            voter: authenticatedUser,
            userVote: true,
            dateTime: firebase.firestore.Timestamp.fromDate(new Date()),
          });
        }
      }
    });
  };

  // const deleteCollections = async () => {
  //   const mVoteDocs = await firebase.db.collection("mVotes").get();
  //   for (let mVoteDoc of mVoteDocs.docs) {
  //     const mVoteRef = firebase.db.collection("mVotes").doc(mVoteDoc.id);
  //     firebase.batchDelete(mVoteRef);
  //   }
  //   const messageDocs = await firebase.db.collection("messages").get();
  //   for (let messageDoc of messageDocs.docs) {
  //     const messageRef = firebase.db.collection("messages").doc(messageDoc.id);
  //     firebase.batchDelete(messageRef);
  //   }
  //   await firebase.commitBatch();
  // };
  console.log(messages);
  return (
    <div className="App">
      {/* <button onClick={deleteCollections}>Delete both collections!</button> */}
      <p>
        <strong>Total User upvotes: </strong>
        {userTotalVotes}
      </p>
      <h1>Messages</h1>
      <ul>
        {Object.keys(messages).map((mId) => {
          const message = messages[mId];
          if (message.voter && message.message) {
            return (
              <li key={mId}>
                <p>
                  From <strong>{message.sender}</strong>, at{" "}
                  {message.dateTime.toDate().toLocaleString()}
                </p>
                <p>{message.message}</p>
                <div>
                  <button
                    style={{
                      backgroundColor: message.userVote ? "green" : "#eeeeee",
                    }}
                    onClick={upVote(mId)}
                  >
                    <span role="img" aria-label="UpVote">
                      👍
                    </span>{" "}
                    {message.totalVotes}
                  </button>
                </div>
              </li>
            );
          }
        })}
      </ul>
    </div>
  );
}
