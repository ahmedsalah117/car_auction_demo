"use client";
import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import { toast, Toaster } from "sonner";
const MAX_BID = 10_000_000;
export default function AuctionPage() {
  const [auctionData, setAuctionData] = useState(null);
  const [newBidAmount, setNewBidAmount] = useState("");
  const [bidderName, setBidderName] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  // Reference to the socket connection
  const socketRef = useRef(null);

  // Initializing the WebSocket connection
  useEffect(() => {
    // Creating the socket connection
    socketRef.current = io({
      path: "/api/socketio",
    });

    // Connection established
    socketRef.current.on("connect", () => {
      console.log("Connected to server!");
      setIsConnected(true);
    });

    // Receiving auction data updates
    socketRef.current.on("auction-data", (data) => {
      
      setAuctionData(data);
    });

    // showing a toast when a new bid is placed in addition to the recent bids section that already shows the bids.
    socketRef.current.on("new-bid", (bidData) => {
      toast.success(`${bidData.bidder} placed a bid of ${bidData.amount.toLocaleString()}`);
    });

    // Handling auction ending
    socketRef.current.on("auction-ended", (endData) => {

      if (endData.winner) {
        alert(
          `🎉 ${endData.message} with ${endData.finalPrice.toLocaleString()}!`
        );
      } else {
        alert(`😔 ${endData.message}. The item remains unsold.`);
      }
    });

    // displaying any bid errors
    socketRef.current.on("bid-error", (errorMessage) => {
      setError(errorMessage);
      setTimeout(() => setError(""), 3000); // Clear the error message after 3 seconds
    });

    // Cleaning up on component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Updating the countdown timer
  useEffect(() => {
    if (!auctionData) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, auctionData.endTime - now);
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [auctionData]);

  // Handling placing a bid
  const placeBid = () => {
    if (!bidderName.trim()) {
      setError("Please enter your name");
      return;
    }

    const amount = parseFloat(newBidAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid bid amount");
      return;
    }
    // validating against the maximum bid.
    if (amount > MAX_BID) {
      toast.error(`Bid amount must not exceed ${MAX_BID.toLocaleString()}`);
      return;
    }

    // validating against the current bid.
    if (amount <= auctionData.currentBid) {
      setError(
        `Bid must be higher than current bid of ${auctionData.currentBid}`
      );
      return;
    }
// sending the bid to the server with the version number to prevent race conditions.
    socketRef.current.emit("place-bid", {
      amount,
      bidderName: bidderName.trim(),
      expectedVersion: auctionData.version, // Include current version
    });

    // Clearing the bid input
    setNewBidAmount("");
    setError("");
  };

  // Time remaining formatter
  const formatTime = (milliseconds) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!auctionData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isConnected ? "Loading auction..." : "Connecting to auction..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 text-black">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <h1 className="text-3xl font-bold">{auctionData.carTitle}</h1>
            <div className="mt-2 flex items-center gap-4">
              <span
                className={`px-3 py-1 rounded-full text-sm ${
                  auctionData.isActive ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {auctionData.isActive ? "Active" : "Ended"}
              </span>
              <span className="text-blue-100">
                Connection: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 p-6">
            {/* Car Image Placeholder */}
            <div className="space-y-4">
              <div className="bg-gray-200 h-64 rounded-lg flex items-center justify-center">
                <span className="text-gray-500 text-lg">
                  {auctionData.carTitle} Image
                </span>
              </div>

              {/* Recent Bids */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Recent Bids</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {auctionData.bids.length === 0 ? (
                    <p className="text-gray-500 text-sm">No bids yet</p>
                  ) : (
                    auctionData.bids
                      .slice(-5)
                      .reverse()
                      .map((bid, index) => (
                        <div
                          key={index}
                          className="flex justify-between text-sm"
                        >
                          <span className="font-medium">{bid.bidder}</span>
                          <span className="text-green-600">
                            ${bid.amount.toLocaleString()}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* Auction Info and Bidding */}
            <div className="space-y-6">
              {/* Current Status */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Current Bid</p>
                    <p className="text-2xl font-bold text-green-700">
                      ${auctionData.currentBid.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Time Left</p>
                    <p className="text-2xl font-bold text-red-600">
                      {timeLeft > 0 ? formatTime(timeLeft) : "00:00"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Starting Price</p>
                      <p className="font-semibold">
                        ${auctionData.startPrice.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Participants</p>
                      <p className="font-semibold">
                        {auctionData.participants.length}
                      </p>
                    </div>
                  </div>

                  {auctionData.highestBidder && (
                    <div className="mt-2">
                      <p className="text-gray-600 text-sm">Highest Bidder</p>
                      <p className="font-semibold">
                        {auctionData.highestBidder}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bidding Form */}
              {auctionData.isActive && timeLeft > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-4">Place Your Bid</h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={bidderName}
                        onChange={(e) => setBidderName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Bid Amount (minimum: $
                        {(auctionData.currentBid + 1).toLocaleString()})
                      </label>
                      <input
                        type="number"
                        value={newBidAmount}
                        onChange={(e) => setNewBidAmount(e.target.value)}
                        min={auctionData.currentBid + 1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={`Enter amount (>${auctionData.currentBid})`}
                      />
                    </div>

                    <button
                      onClick={placeBid}
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
                    >
                      Place Bid
                    </button>
                  </div>
                </div>
              )}

              {/* Error Messages */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Auction Ended Message */}
              {(!auctionData.isActive || timeLeft === 0) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold text-red-800 mb-2">
                    Auction Ended
                  </h3>
                  {auctionData.bids.length === 0 ? (
                    <div className="text-red-700">
                      <p className="mb-2">
                        😔 <strong>No bids were placed</strong>
                      </p>
                      <p className="text-sm">
                        The item remains unsold and will be relisted.
                      </p>
                    </div>
                  ) : auctionData.highestBidder ? (
                    <div className="text-red-700">
                      <p className="mb-2">
                        🎉 <strong>Auction Successful!</strong>
                      </p>
                      <p>
                        Winner: <strong>{auctionData.highestBidder}</strong>
                      </p>
                      <p>
                        Final Price:{" "}
                        <strong>
                          ${auctionData.currentBid.toLocaleString()}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-red-700">Auction processing...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Toaster richColors/>
    </div>
  );
}
