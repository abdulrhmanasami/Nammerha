-- Migration 041: Notify Triggers for GraphQL Subscriptions
-- Enables real-time WebSocket updates via PG LISTEN/NOTIFY bridge.

-- 1. Notify on new notifications
CREATE OR REPLACE FUNCTION notify_new_notification()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('nammerha_notifications', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_notification ON notifications;
CREATE TRIGGER trg_notify_new_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_notification();


-- 2. Notify on project status/progress updates
CREATE OR REPLACE FUNCTION notify_project_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('nammerha_project_updates', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_project_update ON projects;
CREATE TRIGGER trg_notify_project_update
    AFTER UPDATE OF status, progress, total_funded_amount, damage_severity
    ON projects
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION notify_project_update();


-- 3. Notify when escrow is released for a project
CREATE OR REPLACE FUNCTION notify_escrow_release()
RETURNS TRIGGER AS $$
DECLARE
    project_row RECORD;
BEGIN
    -- Fetch the project associated with this escrow item
    SELECT * INTO project_row FROM projects WHERE project_id = NEW.project_id;
    IF FOUND THEN
        -- Send a project update payload to refresh client screens
        PERFORM pg_notify('nammerha_project_updates', row_to_json(project_row)::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_escrow_release ON escrow_ledger;
CREATE TRIGGER trg_notify_escrow_release
    AFTER UPDATE OF payment_status
    ON escrow_ledger
    FOR EACH ROW
    WHEN (OLD.payment_status = 'locked' AND NEW.payment_status = 'released')
    EXECUTE FUNCTION notify_escrow_release();
