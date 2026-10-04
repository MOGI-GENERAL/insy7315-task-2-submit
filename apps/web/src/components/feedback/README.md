# Feedback kit, forms and auth

Every screen uses these pieces for loading, empty, error, success and confirmation states.
Use them as they are, and do not copy them into a screen.
A change goes in a shared branch of its own and is announced in the group chat first.

## Loading a screen's data

`useLoad` runs a repository call and reruns it when its dependencies change.
`LoadState` renders the loading, error and empty states, and calls its children only with data.

```tsx
import { useData, useLoad } from '../../data';
import { Empty, LoadState } from '../../components/feedback';

const { offers } = useData();
const feed = useLoad(() => offers.list({ view: 'feed' }), [offers]);

return (
  <LoadState
    result={feed}
    isEmpty={(d) => d.items.length === 0}
    empty={<Empty icon="list" title={t('feed.empty')} />}
  >
    {(d) => d.items.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
  </LoadState>
);
```

- `useLoad(load, deps, { refreshMs: 15000 })` polls quietly, as the coordinator dashboard does.
  A failed poll keeps the last data on screen.
- `ErrorState` shows the translated message for the error code with a retry button.
  On `UNAUTHENTICATED` it offers sign-in instead.
- `Loading` is the spinner on its own, with `inline` for use inside a sentence or a button.

## Confirming and acting

```tsx
const toast = useToast();
const [open, setOpen] = useState(false);
const [busy, setBusy] = useState(false);

async function release() {
  setBusy(true);
  try {
    await claims.release(claim.id, {});
    toast.success(t('claim.released'));
    navigate('/recipient/claims');
  } catch (error) {
    toast.error(t(errorKey(error)));
  } finally {
    setBusy(false);
    setOpen(false);
  }
}

<ConfirmDialog
  open={open}
  title={t('claim.releaseTitle')}
  confirmLabel={t('claim.releaseConfirm')}
  tone="danger"
  busy={busy}
  onConfirm={release}
  onCancel={() => setOpen(false)}
>
  {t('claim.releaseWhy')}
</ConfirmDialog>;
```

- Claim, release, cancel and handover all go through `ConfirmDialog`.
  Focus starts on Cancel, and Esc cancels unless the action is already running.
- `PendingButton` shows a spinner and ignores clicks while `pending`, and stays focusable.
- Success toasts disappear after five seconds.
  Error toasts stay until dismissed.
- `errorKey(error)` gives the string key for any rejection.
  Show that rather than `error.message`, which is English only.

## Forms

`useForm` keeps the values, runs the contract's zod schema before submitting, and puts server field errors next to the right input.
Field names are dotted paths, the same keys the API uses in its error `fields`, such as `user.email`.

```tsx
import { LoginRequest } from '@fedsa/contract';
import { Field, FormError, useForm } from '../components/forms';

const form = useForm({
  initial: { email: '', password: '' },
  schema: LoginRequest,
  onSubmit: (body) => auth.login(body),
});

<form {...form.formProps}>
  <FormError form={form} />
  <Field form={form} name="email" label={t('login.email')} hint={t('register.phoneHint')}>
    {(props) => <input {...props} className="input" type="email" />}
  </Field>
  <PendingButton type="submit" pending={form.pending}>
    {t('login.signIn')}
  </PendingButton>
</form>;
```

- `Field` wires the label, hint and error to the input through `id`, `aria-invalid` and `aria-describedby`.
- Pass `kind="number"` for a number input.
  An empty box becomes `undefined`, so an optional number passes the schema.
- `Checkbox` is the same for a boolean, such as the consent box.
- After a failed submit, focus moves to the first invalid input.
- A rejection with no field errors shows in `FormError` above the form.
  If `onSubmit` handles an error itself, catch it and do not rethrow.

## Who is signed in

```tsx
import { useAuth, useSession } from '../auth/context';

const { user, organisation } = useSession();
const { logout, setLanguage } = useAuth();
```

- `useSession` works on any screen behind a role route in `App.tsx`.
  `organisation` is null for coordinators and administrators.
- `setLanguage` switches at once, remembers the choice on the device, and saves it to the account when someone is signed in.
- Screens read the user from here, not from `store`.

## Strings

Every user-facing string goes through `useT`.
Keys added since the first release sit in the `untranslated` list at the top of `i18n/strings.ts`, and Afrikaans and isiXhosa show the English until each key is translated into their own list.
