export type PendingIntent =
  | {
      type: 'tournament-signup';
      payload: {
        tournament: {
          id: number | string;
          title: string;
          subtitle?: string;
          date?: string;
          image?: string;
          alias_pago?: string;
        };
      };
    }
  | {
      type: 'service-hire';
      payload: { serviceId: string };
    };
