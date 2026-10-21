#include <gtk/gtk.h>
#include <webkit/webkit.h>
#include <unistd.h>
#include <limits.h>
#include <string.h>

/* Keep file resources and local save downloads inside the offline WebView. */
static gboolean is_local_uri(const gchar *uri) {
    if (!uri) return FALSE;
    const gchar *scheme = g_uri_peek_scheme(uri);
    if (!scheme) return FALSE;
    if (!g_ascii_strcasecmp(scheme, "data") || !g_ascii_strcasecmp(scheme, "blob") ||
        !g_ascii_strcasecmp(scheme, "about")) return TRUE;
    if (g_ascii_strcasecmp(scheme, "file")) return FALSE;
    gchar *hostname = NULL;
    gchar *filename = g_filename_from_uri(uri, &hostname, NULL);
    gboolean local = filename && (!hostname || !*hostname || !g_ascii_strcasecmp(hostname, "localhost"));
    g_free(filename);
    g_free(hostname);
    return local;
}

static gboolean decide_offline_policy(WebKitWebView *view, WebKitPolicyDecision *decision,
                                      WebKitPolicyDecisionType type, gpointer user_data) {
    (void)view;
    (void)user_data;
    const gchar *uri = NULL;
    if (type == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) {
        webkit_policy_decision_ignore(decision);
        return TRUE;
    }
    if (type == WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
        WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(
            WEBKIT_NAVIGATION_POLICY_DECISION(decision));
        uri = webkit_uri_request_get_uri(webkit_navigation_action_get_request(action));
    } else if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) {
        uri = webkit_uri_response_get_uri(webkit_response_policy_decision_get_response(
            WEBKIT_RESPONSE_POLICY_DECISION(decision)));
    }
    if (uri && !is_local_uri(uri)) {
        webkit_policy_decision_ignore(decision);
        return TRUE;
    }
    return FALSE;
}

static void offline_filter_ready(GObject *source, GAsyncResult *result, gpointer user_data) {
    WebKitWebView *view = WEBKIT_WEB_VIEW(user_data);
    GError *error = NULL;
    WebKitUserContentFilter *filter = webkit_user_content_filter_store_save_finish(
        WEBKIT_USER_CONTENT_FILTER_STORE(source), result, &error);
    if (filter) {
        webkit_user_content_manager_add_filter(webkit_web_view_get_user_content_manager(view), filter);
        webkit_user_content_filter_unref(filter);
        webkit_web_view_load_uri(view, g_object_get_data(G_OBJECT(view), "offline-index-uri"));
    } else {
        g_warning("Não foi possível preparar o modo offline: %s", error ? error->message : "erro desconhecido");
        webkit_web_view_load_html(view,
            "<!doctype html><meta charset='utf-8'><p>Não foi possível preparar o modo offline. "
            "Confira a permissão de escrita da pasta de cache e reabra o jogo.</p>", NULL);
    }
    g_clear_error(&error);
    g_object_unref(view);
}

static WebKitWebView *create_offline_web_view(const gchar *project_dir) {
    /* GStreamer reads file audio in the sandboxed web process directly. */
    gchar *audio_path = g_build_filename(project_dir, "assets", "sons", NULL);
    webkit_web_context_add_path_to_sandbox(webkit_web_context_get_default(), audio_path, TRUE);
    g_free(audio_path);
    WebKitWebView *view = WEBKIT_WEB_VIEW(webkit_web_view_new());
    WebKitSettings *settings = webkit_settings_new();
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE);
    webkit_settings_set_allow_file_access_from_file_urls(settings, TRUE);
    webkit_settings_set_allow_universal_access_from_file_urls(settings, FALSE);
    webkit_web_view_set_settings(view, settings);
    g_object_unref(settings);
    g_signal_connect(view, "decide-policy", G_CALLBACK(decide_offline_policy), NULL);

    gchar *index_path = g_build_filename(project_dir, "index.html", NULL);
    gchar *uri = g_filename_to_uri(index_path, NULL, NULL);
    g_free(index_path);
    g_object_set_data_full(G_OBJECT(view), "offline-index-uri", uri, g_free);

    gchar *filter_path = g_build_filename(project_dir, "src-native", "offline-filter.json", NULL);
    gchar *filter_json = NULL;
    gsize length = 0;
    GError *error = NULL;
    if (!g_file_get_contents(filter_path, &filter_json, &length, &error)) {
        g_warning("Filtro offline indisponível: %s", error->message);
        g_clear_error(&error);
        g_free(filter_path);
        webkit_web_view_load_html(view, "<!doctype html><meta charset='utf-8'><p>O arquivo "
            "src-native/offline-filter.json não foi encontrado. Restaure a pasta completa do jogo.</p>", NULL);
        return view;
    }
    g_free(filter_path);
    gchar *cache_path = g_build_filename(g_get_user_cache_dir(), "brasfoot-offline-filters", NULL);
    WebKitUserContentFilterStore *store = webkit_user_content_filter_store_new(cache_path);
    g_free(cache_path);
    GBytes *bytes = g_bytes_new_take(filter_json, length);
    webkit_user_content_filter_store_save(store, "local-files-only", bytes, NULL,
                                         offline_filter_ready, g_object_ref(view));
    g_bytes_unref(bytes);
    g_object_unref(store);
    return view;
}

static void activate(GtkApplication *app, gpointer user_data) {
    (void)user_data;
    char exe_path[PATH_MAX];
    ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
    gchar *project_dir;
    if (len < 0) project_dir = g_get_current_dir();
    else { exe_path[len] = '\0'; project_dir = g_path_get_dirname(exe_path); }

    GtkWidget *window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(window), "Brasfoot Revenge");
    gtk_window_set_default_size(GTK_WINDOW(window), 1260, 840);
    WebKitWebView *view = create_offline_web_view(project_dir);
    g_free(project_dir);
    gtk_window_set_child(GTK_WINDOW(window), GTK_WIDGET(view));
    gtk_window_present(GTK_WINDOW(window));
}

int main(int argc, char **argv) {
    GtkApplication *app = gtk_application_new("com.brasfoot.revenge", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
