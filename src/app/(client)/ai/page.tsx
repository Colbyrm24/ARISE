import { redirect } from 'next/navigation';

/*
  The client-facing AI coach is gone.

  Coaching advice reaching a client should come from their actual coach, not
  from a model answering in his name — a client cannot tell the two apart, and
  the whole product is that a real person is reading their food and their
  lifts. The assistant now lives on the coach's side, where it drafts and
  summarises for him and he decides what gets sent.

  The route stays and redirects rather than 404ing: it was linked from the
  Today screen and a floating button on every screen, so there are live
  bookmarks and app shortcuts pointing here. Messages is where somebody who
  came looking for an answer actually wants to be.
*/
export default async function RetiredAiPage() {
  redirect('/messages');
}
