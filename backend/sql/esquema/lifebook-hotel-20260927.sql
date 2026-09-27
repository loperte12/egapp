--
-- PostgreSQL database dump
--

\restrict DI8ehiiWtQGwpTNAk2lFbshJqkVrjYbZuOnsTDhIXqkk9f6Ucan1PewMOymQdrB

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: hotel_profiles; Type: TABLE; Schema: lifebook; Owner: -
--

CREATE TABLE lifebook.hotel_profiles (
    shop_id uuid NOT NULL,
    property_kind character varying(20) DEFAULT 'hotel'::character varying NOT NULL,
    stars smallint,
    checkin_from character varying(5) DEFAULT '14:00'::character varying NOT NULL,
    checkin_until character varying(5) DEFAULT '22:00'::character varying NOT NULL,
    checkout_until character varying(5) DEFAULT '12:00'::character varying NOT NULL,
    reception_open_24h boolean DEFAULT false NOT NULL,
    amenities jsonb DEFAULT '[]'::jsonb NOT NULL,
    house_rules character varying(600),
    cancellation_policy character varying(600),
    taxes_included boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    arrival_note text,
    CONSTRAINT lb_hp_kind CHECK (((property_kind)::text = ANY ((ARRAY['hotel'::character varying, 'hostal'::character varying, 'guest_house'::character varying, 'apartahotel'::character varying, 'resort'::character varying, 'motel'::character varying])::text[]))),
    CONSTRAINT lb_hp_stars CHECK (((stars IS NULL) OR ((stars >= 1) AND (stars <= 5))))
);


--
-- Name: TABLE hotel_profiles; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON TABLE lifebook.hotel_profiles IS 'Parte 42: ficha del alojamiento (políticas de llegada, normas, servicios). Una por tienda hotelera.';


--
-- Name: COLUMN hotel_profiles.arrival_note; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.hotel_profiles.arrival_note IS 'Cómo llegar y dónde hacer el check-in (entrada, piso, referencia). Lo escribe el hotel y lo lee el huésped al llegar.';


--
-- Name: reservation_nights; Type: TABLE; Schema: lifebook; Owner: -
--

CREATE TABLE lifebook.reservation_nights (
    room_type_id uuid NOT NULL,
    night date NOT NULL,
    unit_index smallint NOT NULL,
    reservation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lb_rn_unit CHECK (((unit_index >= 0) AND (unit_index <= 199)))
);


--
-- Name: TABLE reservation_nights; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON TABLE lifebook.reservation_nights IS 'Parte 42: una fila por noche y unidad ocupada. La PK (room_type_id, night, unit_index) es la ÚNICA verdad del inventario: dos reservas simultáneas de la última habitación no pueden colar — la segunda viola la clave. El calendario sale de aquí con un GROUP BY.';


--
-- Name: reservations; Type: TABLE; Schema: lifebook; Owner: -
--

CREATE TABLE lifebook.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    shop_id uuid,
    room_type_id uuid,
    guest_id uuid NOT NULL,
    guest_name character varying(120) NOT NULL,
    guest_phone character varying(24) NOT NULL,
    guest_email character varying(160),
    check_in date NOT NULL,
    check_out date NOT NULL,
    nights smallint NOT NULL,
    units smallint DEFAULT 1 NOT NULL,
    guests smallint DEFAULT 1 NOT NULL,
    room_name_snapshot character varying(120),
    price_per_night_xaf integer NOT NULL,
    subtotal_xaf integer NOT NULL,
    cleaning_fee_xaf integer DEFAULT 0 NOT NULL,
    taxes_xaf integer DEFAULT 0 NOT NULL,
    total_xaf integer NOT NULL,
    deposit_percent smallint DEFAULT 30 NOT NULL,
    deposit_xaf integer DEFAULT 0 NOT NULL,
    remaining_xaf integer DEFAULT 0 NOT NULL,
    payment_method character varying(24) NOT NULL,
    payment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    status character varying(20) DEFAULT 'hold'::character varying NOT NULL,
    hold_expires_at timestamp with time zone,
    note character varying(300),
    idempotency_key character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deposit_paid_at timestamp with time zone,
    paid_at timestamp with time zone,
    checked_in_at timestamp with time zone,
    checked_out_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason character varying(300),
    deposit_confirmed_by uuid,
    deposit_proof character varying(200),
    CONSTRAINT lb_res_estado CHECK (((status)::text = ANY ((ARRAY['hold'::character varying, 'pending'::character varying, 'confirmed'::character varying, 'checked_in'::character varying, 'checked_out'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[]))),
    CONSTRAINT lb_res_fechas CHECK ((check_out > check_in)),
    CONSTRAINT lb_res_guests CHECK (((guests >= 1) AND (guests <= 200))),
    CONSTRAINT lb_res_importes CHECK (((price_per_night_xaf > 0) AND (subtotal_xaf >= 0) AND (cleaning_fee_xaf >= 0) AND (taxes_xaf >= 0) AND (total_xaf > 0))),
    CONSTRAINT lb_res_noches CHECK (((nights = (check_out - check_in)) AND ((nights >= 1) AND (nights <= 365)))),
    CONSTRAINT lb_res_pago CHECK (((payment_method)::text = ANY ((ARRAY['transfer'::character varying, 'deposit'::character varying, 'billing'::character varying, 'in_store'::character varying, 'cash_on_delivery'::character varying, 'likebook_wallet'::character varying])::text[]))),
    CONSTRAINT lb_res_pago_est CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'proof_submitted'::character varying, 'deposit_paid'::character varying, 'paid'::character varying, 'refunded'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT lb_res_senal CHECK ((((deposit_percent >= 0) AND (deposit_percent <= 100)) AND (deposit_xaf >= 0) AND (remaining_xaf >= 0) AND ((deposit_xaf + remaining_xaf) = total_xaf))),
    CONSTRAINT lb_res_units CHECK (((units >= 1) AND (units <= 50)))
);


--
-- Name: COLUMN reservations.payment_status; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.reservations.payment_status IS 'Dinero (separado del estado de la reserva): pending → proof_submitted → deposit_paid/paid.';


--
-- Name: COLUMN reservations.status; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.reservations.status IS 'Reserva: hold (retenida, sin pagar) → pending (señal pagada) → confirmed (hotel) → checked_in → checked_out · cancelled · no_show.';


--
-- Name: COLUMN reservations.hold_expires_at; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.reservations.hold_expires_at IS 'Parte 42: mientras dura la retención la habitación está bloqueada; al vencer, el calendario la libera aunque el barrido no haya pasado.';


--
-- Name: COLUMN reservations.deposit_confirmed_by; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.reservations.deposit_confirmed_by IS 'Parte 42-a: quién confirmó el cobro de la señal (dueño del hotel o admin). Queda para reclamaciones.';


--
-- Name: COLUMN reservations.deposit_proof; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.reservations.deposit_proof IS 'Parte 42-a: referencia con la que se confirmó (nº de transferencia, «visto en cuenta»…).';


--
-- Name: room_type_calendar; Type: TABLE; Schema: lifebook; Owner: -
--

CREATE TABLE lifebook.room_type_calendar (
    room_type_id uuid NOT NULL,
    date date NOT NULL,
    price_xaf integer,
    min_nights smallint,
    is_closed boolean DEFAULT false NOT NULL,
    note character varying(120),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lb_rtc_date CHECK ((date >= '2020-01-01'::date)),
    CONSTRAINT lb_rtc_min CHECK (((min_nights IS NULL) OR ((min_nights >= 1) AND (min_nights <= 90)))),
    CONSTRAINT lb_rtc_price CHECK (((price_xaf IS NULL) OR (price_xaf > 0)))
);


--
-- Name: TABLE room_type_calendar; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON TABLE lifebook.room_type_calendar IS 'Parte 42: el calendario del hotelero — cierra fechas, pone precio de temporada o exige estancia mínima en días concretos.';


--
-- Name: room_types; Type: TABLE; Schema: lifebook; Owner: -
--

CREATE TABLE lifebook.room_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    product_id uuid,
    name character varying(120) NOT NULL,
    description character varying(2000),
    capacity smallint DEFAULT 2 NOT NULL,
    beds jsonb DEFAULT '[]'::jsonb NOT NULL,
    size_m2 smallint,
    total_units smallint DEFAULT 1 NOT NULL,
    base_price_xaf integer NOT NULL,
    weekend_price_xaf integer,
    cleaning_fee_xaf integer DEFAULT 0 NOT NULL,
    taxes_xaf integer DEFAULT 0 NOT NULL,
    taxes_included boolean DEFAULT true NOT NULL,
    min_nights smallint DEFAULT 1 NOT NULL,
    max_nights smallint DEFAULT 30 NOT NULL,
    deposit_percent smallint DEFAULT 30 NOT NULL,
    hold_minutes smallint DEFAULT 20 NOT NULL,
    confirmation_hours smallint DEFAULT 24 NOT NULL,
    cancellation_hours smallint DEFAULT 48 NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    amenities jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lb_rt_base_price CHECK ((base_price_xaf > 0)),
    CONSTRAINT lb_rt_cancelh CHECK (((cancellation_hours >= 0) AND (cancellation_hours <= 720))),
    CONSTRAINT lb_rt_capacity CHECK (((capacity >= 1) AND (capacity <= 30))),
    CONSTRAINT lb_rt_confh CHECK (((confirmation_hours >= 1) AND (confirmation_hours <= 168))),
    CONSTRAINT lb_rt_deposit CHECK (((deposit_percent >= 0) AND (deposit_percent <= 100))),
    CONSTRAINT lb_rt_extras CHECK (((cleaning_fee_xaf >= 0) AND (taxes_xaf >= 0))),
    CONSTRAINT lb_rt_hold CHECK (((hold_minutes >= 5) AND (hold_minutes <= 120))),
    CONSTRAINT lb_rt_max_nights CHECK (((max_nights >= min_nights) AND (max_nights <= 365))),
    CONSTRAINT lb_rt_min_nights CHECK (((min_nights >= 1) AND (min_nights <= 90))),
    CONSTRAINT lb_rt_size CHECK (((size_m2 IS NULL) OR ((size_m2 >= 4) AND (size_m2 <= 2000)))),
    CONSTRAINT lb_rt_units CHECK (((total_units >= 1) AND (total_units <= 200))),
    CONSTRAINT lb_rt_weekend CHECK (((weekend_price_xaf IS NULL) OR (weekend_price_xaf > 0)))
);


--
-- Name: COLUMN room_types.deposit_percent; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.room_types.deposit_percent IS 'Parte 42: % del total que se paga AHORA (señal / pago parcial). 0 = pago al llegar.';


--
-- Name: COLUMN room_types.hold_minutes; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.room_types.hold_minutes IS 'Parte 42: minutos que la habitación queda retenida mientras se paga la señal (5–120).';


--
-- Name: COLUMN room_types.confirmation_hours; Type: COMMENT; Schema: lifebook; Owner: -
--

COMMENT ON COLUMN lifebook.room_types.confirmation_hours IS 'Parte 42: horas que tiene el hotel para confirmar una reserva sin señal antes de que el barrido la libere (1–168).';


--
-- Name: hotel_profiles hotel_profiles_pkey; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.hotel_profiles
    ADD CONSTRAINT hotel_profiles_pkey PRIMARY KEY (shop_id);


--
-- Name: reservation_nights reservation_nights_pkey; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservation_nights
    ADD CONSTRAINT reservation_nights_pkey PRIMARY KEY (room_type_id, night, unit_index);


--
-- Name: reservations reservations_code_key; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT reservations_code_key UNIQUE (code);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: room_type_calendar room_type_calendar_pkey; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.room_type_calendar
    ADD CONSTRAINT room_type_calendar_pkey PRIMARY KEY (room_type_id, date);


--
-- Name: room_types room_types_pkey; Type: CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.room_types
    ADD CONSTRAINT room_types_pkey PRIMARY KEY (id);


--
-- Name: ix_lb_res_confirma; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_confirma ON lifebook.reservations USING btree (deposit_confirmed_by) WHERE (deposit_confirmed_by IS NOT NULL);


--
-- Name: ix_lb_res_guest; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_guest ON lifebook.reservations USING btree (guest_id, created_at DESC);


--
-- Name: ix_lb_res_hold; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_hold ON lifebook.reservations USING btree (status, hold_expires_at) WHERE ((status)::text = 'hold'::text);


--
-- Name: ix_lb_res_nights_reserva; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_nights_reserva ON lifebook.reservation_nights USING btree (reservation_id);


--
-- Name: ix_lb_res_room; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_room ON lifebook.reservations USING btree (room_type_id, check_in, check_out);


--
-- Name: ix_lb_res_shop; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_res_shop ON lifebook.reservations USING btree (shop_id, status, check_in);


--
-- Name: ix_lb_room_types_price; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_room_types_price ON lifebook.room_types USING btree (base_price_xaf);


--
-- Name: ix_lb_room_types_shop; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_room_types_shop ON lifebook.room_types USING btree (shop_id, is_active);


--
-- Name: ix_lb_rtc_fechas; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE INDEX ix_lb_rtc_fechas ON lifebook.room_type_calendar USING btree (date, is_closed);


--
-- Name: uq_lb_res_idem; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE UNIQUE INDEX uq_lb_res_idem ON lifebook.reservations USING btree (guest_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_lb_room_types_name; Type: INDEX; Schema: lifebook; Owner: -
--

CREATE UNIQUE INDEX uq_lb_room_types_name ON lifebook.room_types USING btree (shop_id, lower((name)::text));


--
-- Name: hotel_profiles hotel_profiles_shop_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.hotel_profiles
    ADD CONSTRAINT hotel_profiles_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES lifebook.shops(id) ON DELETE CASCADE;


--
-- Name: reservations lb_res_confirma_fk; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT lb_res_confirma_fk FOREIGN KEY (deposit_confirmed_by) REFERENCES mobility.users(id) ON DELETE SET NULL;


--
-- Name: reservation_nights lb_rn_reserva_fk; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservation_nights
    ADD CONSTRAINT lb_rn_reserva_fk FOREIGN KEY (reservation_id) REFERENCES lifebook.reservations(id) ON DELETE CASCADE;


--
-- Name: reservation_nights reservation_nights_room_type_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservation_nights
    ADD CONSTRAINT reservation_nights_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES lifebook.room_types(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_guest_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT reservations_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES mobility.users(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_room_type_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT reservations_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES lifebook.room_types(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_shop_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.reservations
    ADD CONSTRAINT reservations_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES lifebook.shops(id) ON DELETE SET NULL;


--
-- Name: room_type_calendar room_type_calendar_room_type_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.room_type_calendar
    ADD CONSTRAINT room_type_calendar_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES lifebook.room_types(id) ON DELETE CASCADE;


--
-- Name: room_types room_types_product_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.room_types
    ADD CONSTRAINT room_types_product_id_fkey FOREIGN KEY (product_id) REFERENCES lifebook.products(id) ON DELETE SET NULL;


--
-- Name: room_types room_types_shop_id_fkey; Type: FK CONSTRAINT; Schema: lifebook; Owner: -
--

ALTER TABLE ONLY lifebook.room_types
    ADD CONSTRAINT room_types_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES lifebook.shops(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict DI8ehiiWtQGwpTNAk2lFbshJqkVrjYbZuOnsTDhIXqkk9f6Ucan1PewMOymQdrB

