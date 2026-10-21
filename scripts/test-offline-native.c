#define main brasfoot_application_main
#include "../src-native/main.c"
#undef main
#include <ifaddrs.h>
#include <sys/socket.h>

static GMainLoop *test_loop;
static const gchar *test_root;
static const gchar *export_path;
static const gchar *season_path = NULL;
static gboolean career_mode = FALSE;
static gboolean profile_mode = FALSE;
static gboolean javascript_done = FALSE, download_done = FALSE;
static int test_status = 1, load_stage = 0;

static void maybe_finish(void) {
    if (javascript_done && download_done) {
        test_status = 0;
        g_print("PASS: native WebKit app, local save export and reload, with no network interfaces.\n");
        g_main_loop_quit(test_loop);
    }
}

static void fail(const gchar *message) {
    g_printerr("FAIL: %s\n", message);
    g_main_loop_quit(test_loop);
}

static void profile_snapshot_ready(GObject *source, GAsyncResult *result, gpointer data) {
    (void)data;
    GError *error = NULL;
    GdkTexture *texture = webkit_web_view_get_snapshot_finish(WEBKIT_WEB_VIEW(source), result, &error);
    if (!texture) { fail(error ? error->message : "Profile snapshot failed."); g_clear_error(&error); return; }
    if (!gdk_texture_save_to_png(texture, g_getenv("BRASFOOT_PROFILE_SCREENSHOT"))) fail("Could not save profile snapshot.");
    g_object_unref(texture);
    webkit_web_view_evaluate_javascript(WEBKIT_WEB_VIEW(source), "window.profileSnapshotDone=true", -1, NULL, NULL, NULL, NULL, NULL);
}

static void script_message(WebKitUserContentManager *manager, JSCValue *value, gpointer data) {
    (void)manager;
    gchar *message = jsc_value_to_string(value);
    if (profile_mode && !strcmp(message,"SNAPSHOT")) {
        if (g_getenv("BRASFOOT_PROFILE_SCREENSHOT")) webkit_web_view_get_snapshot(WEBKIT_WEB_VIEW(data), WEBKIT_SNAPSHOT_REGION_VISIBLE,
            WEBKIT_SNAPSHOT_OPTIONS_NONE, NULL, profile_snapshot_ready, NULL);
        else webkit_web_view_evaluate_javascript(WEBKIT_WEB_VIEW(data), "window.profileSnapshotDone=true", -1, NULL, NULL, NULL, NULL, NULL);
    }
    else if (!strcmp(message,"RELOAD")) webkit_web_view_reload(WEBKIT_WEB_VIEW(data));
    else if (g_str_has_prefix(message,"PASS:")) { g_print("%s\n",message);javascript_done=TRUE;maybe_finish(); }
    else fail(message);
    g_free(message);
}

static void evaluated(GObject *source, GAsyncResult *result, gpointer data) {
    (void)data;
    GError *error=NULL;
    JSCValue *value=webkit_web_view_evaluate_javascript_finish(WEBKIT_WEB_VIEW(source),result,&error);
    if(error){fail(error->message);g_error_free(error);}
    if(value)g_object_unref(value);
}

static void loaded(WebKitWebView *view, WebKitLoadEvent event, gpointer data) {
    (void)data;
    if(event!=WEBKIT_LOAD_FINISHED)return;
    const gchar *uri=webkit_web_view_get_uri(view);
    if(!uri || !g_str_has_suffix(uri,"index.html")) { fail("Offline filter or start page failed.");return; }
    const gchar *script_name=profile_mode ? "test-manager-profile-native.js" : career_mode ? "test-career-transition.js" : season_path ? "test-season-save.js" : "test-offline-smoke.js";
    gchar *script_path=g_build_filename(test_root,"scripts",script_name,NULL);
    gchar *script=NULL;GError *error=NULL;
    if(!g_file_get_contents(script_path,&script,NULL,&error)){fail(error->message);g_clear_error(&error);g_free(script_path);return;}
    g_free(script_path);
    gchar *season=NULL;
    if(season_path && !g_file_get_contents(season_path,&season,NULL,&error)){fail(error->message);g_clear_error(&error);g_free(script);return;}
    gchar *expression=g_strdup_printf("%s(%d,%s);undefined;",script,load_stage++,season ? season : "null");
    webkit_web_view_evaluate_javascript(view,expression,-1,NULL,NULL,NULL,evaluated,NULL);
    g_free(script);g_free(expression);g_free(season);
}

static void resource_started(WebKitWebView *view, WebKitWebResource *resource, WebKitURIRequest *request, gpointer data) {
    (void)view;(void)resource;(void)data;
    if(!is_local_uri(webkit_uri_request_get_uri(request)))fail("Unexpected external request.");
}

static gboolean destination(WebKitDownload *download, const gchar *suggested, gpointer data) {
    (void)suggested;(void)data;
    webkit_download_set_destination(download,export_path);
    return TRUE;
}

static void downloaded(WebKitDownload *download, gpointer data) {
    (void)download;(void)data;
    gchar *contents=NULL;gsize size=0;GError *error=NULL;
    if(!g_file_get_contents(export_path,&contents,&size,&error)){fail(error->message);g_clear_error(&error);return;}
    if(size<1000||(!season_path&&!strstr(contents,"\"activeMatch\""))||!strstr(contents,"\"divisionTeams\""))fail("Exported local save was incomplete.");
    else {g_print("Local export: %zu bytes\n",size);download_done=TRUE;maybe_finish();}
    g_free(contents);
}

static void download_failed(WebKitDownload *download, GError *error, gpointer data) {
    (void)download;(void)data;fail(error->message);
}

static void download_started(WebKitNetworkSession *session, WebKitDownload *download, gpointer data) {
    (void)session;(void)data;
    g_signal_connect(download,"decide-destination",G_CALLBACK(destination),NULL);
    g_signal_connect(download,"finished",G_CALLBACK(downloaded),NULL);
    g_signal_connect(download,"failed",G_CALLBACK(download_failed),NULL);
}

static gboolean timeout(gpointer data) { (void)data;fail("Offline test timed out.");return G_SOURCE_REMOVE; }

/* Sandboxed runners can forbid the netlink socket used by getifaddrs. */
static gboolean isolated_network_from_proc(void) {
    gchar *devices = NULL, *routes = NULL, *ipv6 = NULL;
    gboolean isolated = g_file_get_contents("/proc/net/dev", &devices, NULL, NULL)
        && g_file_get_contents("/proc/net/route", &routes, NULL, NULL)
        && g_file_get_contents("/proc/net/if_inet6", &ipv6, NULL, NULL);
    if (isolated) {
        gchar **lines = g_strsplit(devices, "\n", -1);
        for (guint i = 2; lines[i]; i++) {
            gchar *line = g_strstrip(lines[i]);
            if (*line && !g_str_has_prefix(line, "lo:")) isolated = FALSE;
        }
        g_strfreev(lines);
        lines = g_strsplit(routes, "\n", -1);
        for (guint i = 0; lines[i]; i++) {
            gchar *line = g_strstrip(lines[i]);
            if (*line && !g_str_has_prefix(line, "Iface")) isolated = FALSE;
        }
        g_strfreev(lines);
        if (*g_strstrip(ipv6)) isolated = FALSE;
    }
    g_free(devices); g_free(routes); g_free(ipv6);
    return isolated;
}

int main(int argc,char **argv) {
    if(argc!=3 && argc!=4 && argc!=5){g_printerr("Usage: test PROJECT_DIR EXPORT_PATH [--resume | --season SEASON_JSON | --career SEASON_JSON | --profile SEASON_JSON]\n");return 1;}
    if(argc==4 && !strcmp(argv[3],"--resume")) load_stage=1;
    else if(argc==5 && !strcmp(argv[3],"--season")) season_path=argv[4];
    else if(argc==5 && !strcmp(argv[3],"--career")){season_path=argv[4];career_mode=TRUE;}
    else if(argc==5 && !strcmp(argv[3],"--profile")){season_path=argv[4];profile_mode=TRUE;}
    else if(argc!=3){g_printerr("Invalid test arguments.\n");return 1;}
    struct ifaddrs *interfaces=NULL;
    if(getifaddrs(&interfaces)!=0 && !isolated_network_from_proc()){g_printerr("Cannot verify an isolated network namespace.\n");return 1;}
    for(struct ifaddrs *item=interfaces;item;item=item->ifa_next){
        if(item->ifa_addr && (item->ifa_addr->sa_family==AF_INET || item->ifa_addr->sa_family==AF_INET6)){
            g_printerr("Run this test inside an isolated network namespace.\n");
            freeifaddrs(interfaces);return 1;
        }
    }
    freeifaddrs(interfaces);
    test_root=argv[1];export_path=argv[2];
    g_set_prgname("brasfoot-offline-native-test");
    gtk_init();test_loop=g_main_loop_new(NULL,FALSE);
    const gchar *width = g_getenv("BRASFOOT_TEST_WIDTH");
    GtkWidget *window=gtk_window_new();gtk_window_set_default_size(GTK_WINDOW(window),width ? atoi(width) : 1260,840);
    WebKitWebView *view=create_offline_web_view(test_root);
    WebKitUserContentManager *manager=webkit_web_view_get_user_content_manager(view);
    g_signal_connect(manager,"script-message-received::offlineTest",G_CALLBACK(script_message),view);
    webkit_user_content_manager_register_script_message_handler(manager,"offlineTest",NULL);
    g_signal_connect(view,"load-changed",G_CALLBACK(loaded),NULL);
    g_signal_connect(view,"resource-load-started",G_CALLBACK(resource_started),NULL);
    g_signal_connect(webkit_web_view_get_network_session(view),"download-started",G_CALLBACK(download_started),NULL);
    gtk_window_set_child(GTK_WINDOW(window),GTK_WIDGET(view));gtk_window_present(GTK_WINDOW(window));
    g_timeout_add_seconds(career_mode ? 180 : 30,timeout,NULL);g_main_loop_run(test_loop);
    gtk_window_destroy(GTK_WINDOW(window));g_main_loop_unref(test_loop);
    return test_status;
}
