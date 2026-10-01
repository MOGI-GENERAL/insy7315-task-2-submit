/* DISPATCH — DRIVERS HAVE NO ACCOUNT; PREVIEW SHOWS THE ONE WHATSAPP MESSAGE THEY GET */

import { useState } from 'react';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { EventBanner } from '../../components/EventBanner';
import { EmptyState, PageHead, Section } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { awaitingDispatch, collectionForClaim } from '../../store/selectors';
import { driverContacts } from '../../store/seed';
import { formatKg, formatTime, formatWhen } from '../../lib/format';
import './Coordinator.css';

export function Dispatch() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const all = awaitingDispatch(state);
  const waiting = all.filter((v) => !collectionForClaim(state, v.claim.id));
  const arranged = all.filter((v) => collectionForClaim(state, v.claim.id));

  return (
    <>
      <PageHead
        title="Dispatch a driver"
        lead="Recipients who claimed food they cannot fetch themselves. Each driver is sent only the collection they are doing."
      />

      <EventBanner />

      <Section title="Waiting for transport" count={waiting.length}>
        {waiting.length === 0 ? (
          <EmptyState
            icon="truck"
            title="Every collection has transport"
            body="Nothing is waiting on a driver right now."
          />
        ) : (
          waiting.map(({ claim, offer, donorOrg, recipientOrg }) => {
            const driverName = chosen[claim.id] ?? driverContacts[0].name;
            const driver = driverContacts.find((d) => d.name === driverName)!;
            const message = [
              `FEDSA collection ${offer.reference}`,
              ``,
              `${offer.title}, ${formatKg(offer.offeredQuantityKg)}`,
              `Collect: ${donorOrg?.name}, ${donorOrg?.suburb}`,
              `Ask for: ${donorOrg?.contactName}`,
              `Deliver: ${recipientOrg?.name}, ${recipientOrg?.suburb}`,
              `By: ${formatTime(offer.collectionDeadline)} today`,
            ].join('\n');

            return (
              <div className="dispatch-card" key={claim.id}>
                <div className="dispatch-card__head">
                  <div className="dispatch-card__photo">
                    <FoodPhoto photo={offer.photo} />
                  </div>
                  <div className="dispatch-card__who">
                    <strong>{offer.title}</strong>
                    <span className="muted">
                      {offer.reference} · {formatKg(offer.offeredQuantityKg)}
                    </span>
                    <span className="dispatch-card__route">
                      <Icon name="pin" size={16} />
                      {donorOrg?.suburb}
                      <Icon name="forward" size={14} />
                      {recipientOrg?.suburb}
                    </span>
                    <span className="dispatch-card__route">
                      <Countdown deadline={offer.collectionDeadline} />
                    </span>
                  </div>
                </div>

                <div className="dispatch-card__body">
                  <fieldset className="field">
                    <legend className="field__label">Who is collecting it?</legend>
                    <div className="driver-grid">
                      {driverContacts.map((d) => (
                        <label key={d.phone} className="driver-option">
                          <input
                            type="radio"
                            name={`driver-${claim.id}`}
                            checked={driverName === d.name}
                            onChange={() => setChosen((c) => ({ ...c, [claim.id]: d.name }))}
                          />
                          <span>
                            <strong>{d.name}</strong>
                            <small>{d.note}</small>
                            <small>{d.phone}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <span className="field__hint">
                      Drivers hold no account on the platform. They receive one message per
                      collection and nothing else.
                    </span>
                  </fieldset>

                  <div className="wa-preview">
                    <span className="wa-preview__label">
                      <Icon name="phone" size={14} />
                      WhatsApp to {driver.phone}
                    </span>
                    <div className="wa-preview__bubble">{message}</div>
                  </div>

                  <button
                    type="button"
                    className="btn btn--go btn--block"
                    onClick={() =>
                      dispatch({
                        type: 'DISPATCH_DRIVER',
                        claimId: claim.id,
                        userId: user.id,
                        driverName: driver.name,
                        driverPhone: driver.phone,
                      })
                    }
                  >
                    <Icon name="truck" size={20} />
                    Send to {driver.name}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {arranged.length > 0 && (
        <Section title="Driver on the way" count={arranged.length}>
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Collections with a driver already dispatched</caption>
              <thead>
                <tr>
                  <th scope="col">Offer</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Route</th>
                  <th scope="col">Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {arranged.map(({ claim, offer, donorOrg, recipientOrg }) => {
                  const collection = collectionForClaim(state, claim.id)!;
                  return (
                    <tr key={claim.id}>
                      <td>
                        <strong>{offer.reference}</strong>
                        <div className="muted">{offer.title}</div>
                      </td>
                      <td>
                        {collection.driverName}
                        <div className="muted">{collection.driverPhone}</div>
                      </td>
                      <td>
                        {donorOrg?.suburb} to {recipientOrg?.suburb}
                      </td>
                      <td>{formatWhen(collection.dispatchedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
