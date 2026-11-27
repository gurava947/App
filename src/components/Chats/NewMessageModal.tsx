import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { ConnectionRequest, DirectoryUser } from "../../types";

export function NewMessageModal({ directory, incomingRequests, search, setSearch, onClose, onChoose, onRequest, onAccept, onDecline }: {
  directory: DirectoryUser[];
  incomingRequests: ConnectionRequest[];
  search: string;
  setSearch: (value: string) => void;
  onClose: () => void;
  onChoose: (contactId: string) => void;
  onRequest: (contactId: string) => void;
  onAccept: (requestId: number) => void;
  onDecline: (requestId: number) => void;
}) {
  const needle = search.trim().toLowerCase();
  const filteredDirectory = directory.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(needle));
  const filteredRequests = incomingRequests.filter((request) => `${request.senderName} ${request.senderEmail}`.toLowerCase().includes(needle));

  return <section className="connection-search-page" aria-labelledby="new-message-title">
      <div className="modal-head">
        <button className="icon-button connection-search-back" type="button" aria-label="Back to chats" onClick={onClose}><Icon name="back" /></button>
        <div><div className="eyebrow">CONNECTIONS</div><h2 id="new-message-title">Find people</h2></div>
      </div>
      <label className="modal-search"><Icon name="search" size={18} /><input autoFocus value={search} placeholder="Search by name or email" onChange={(event) => setSearch(event.target.value)} /></label>
      {filteredRequests.length > 0 && <section className="connection-request-section" aria-label="Incoming connection requests">
        <div className="modal-section-label">CONNECTION REQUESTS <span>{filteredRequests.length}</span></div>
        <div className="modal-contact-list">
          {filteredRequests.map((request) => <div className="connection-request-row" key={request.id}>
            <Avatar initials={request.senderName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")} bg="#e2f3e8" fg="#159b62" />
            <span className="connection-person-meta"><strong>{request.senderName}</strong><small>{request.senderEmail} wants to connect</small></span>
            <div className="request-actions">
              <button className="primary-button request-accept" type="button" onClick={() => onAccept(request.id)}>Accept</button>
              <button className="request-decline" type="button" onClick={() => onDecline(request.id)}>Decline</button>
            </div>
          </div>)}
        </div>
      </section>}
      <div className="modal-section-label people-heading">PEOPLE <span>{filteredDirectory.length}</span></div>
      <div className="modal-contact-list directory-list">
        {filteredDirectory.map((person) => <div className="directory-person" key={person.id}>
          <Avatar initials={person.initials} bg={person.bg} fg={person.fg} online={person.online} />
          <span className="connection-person-meta"><strong>{person.name}</strong><small>{person.email}</small></span>
          {person.status === "connected" && <button className="connection-state-button is-connected" type="button" onClick={() => onChoose(person.id)}>Message</button>}
          {person.status === "available" && <button className="connection-state-button" type="button" onClick={() => onRequest(person.id)}>Connect</button>}
          {person.status === "outgoing" && <button className="connection-state-button is-pending" type="button" disabled>Requested</button>}
          {person.status === "incoming" && <button className="connection-state-button is-pending" type="button" disabled>Respond above</button>}
        </div>)}
        {filteredDirectory.length === 0 && <div className="modal-empty">{directory.length ? "No people match your search." : "When another account signs in, you can find and request them here."}</div>}
      </div>
  </section>;
}
