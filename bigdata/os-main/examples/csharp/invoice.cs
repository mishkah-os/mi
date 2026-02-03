using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Web;
using System.Net.Http;
using System.Text;
using System.Collections.Specialized;
using Newtonsoft.Json.Linq;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using static Mas.com.eg.Models.invoice;
namespace Mas.com.eg.Models
{
    public class invoice
    {
        public static bool IsValidUniqueId(string uniqueId)
        {
            if (string.IsNullOrEmpty(uniqueId) || uniqueId.Length < 1 || uniqueId.Length > 36)
            {
                return false;
            }

            string pattern = @"^[a-zA-Z0-9\-]+$";
            if (!Regex.IsMatch(uniqueId, pattern))
            {
                return false;
            }

            return true;
        }
        public static bool CheckApiKey(HttpContext context, string API_KEY)
        {
            try
            {
                string apiKeyHeader = context.Request.Headers["X-API-KEY"];
                string authHeader = context.Request.Headers["Authorization"];

                string apiKeyAuth = null;
                if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Basic "))
                {
                    apiKeyAuth = authHeader.Substring("Basic ".Length);
                }

                string apiKeyQuery = context.Request.QueryString["X-API-KEY"];

                string apiKeyBody = null;
                if (context.Request.ContentType == "application/json")
                {
                    try
                    {
                        using (var reader = new System.IO.StreamReader(context.Request.InputStream))
                        {
                            string jsonBody = reader.ReadToEnd();
                            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
                            var jsonData = serializer.Deserialize<Dictionary<string, object>>(jsonBody);

                            if (jsonData != null && jsonData.ContainsKey("api_key"))
                            {
                                apiKeyBody = jsonData["api_key"]?.ToString();
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        // LogError("Error parsing JSON in CheckApi", ex);
                    }
                }

                if (apiKeyHeader == API_KEY || apiKeyQuery == API_KEY || apiKeyBody == API_KEY || apiKeyAuth == API_KEY)
                {
                    return true; // مصرح له
                }
                else
                {
                    //LogUnauthorizedAttempt(new
                    //{
                    //    message = "Unauthorized",
                    //    request_headers = GetHeaders(context),
                    //    request_args = GetQueryString(context),
                    //    request_json = apiKeyBody != null ? new { api_key = apiKeyBody } : null
                    //});
                    return false; // غير مصرح له
                }
            }
            catch (Exception ex)
            {
                //LogError("Error in CheckApi", ex);
                return false; // في حال حدوث خطأ
            }
        }

        public static bool IsBase64String(string base64)
        {
            if (string.IsNullOrEmpty(base64))
            {
                return false;
            }

            string pattern = @"^[a-zA-Z0-9\+/]*={0,3}$";

            if (base64.Length % 4 != 0)
            {
                return false;
            }

            return Regex.IsMatch(base64, pattern);
        }


        private static MemoryStream CopyToMemoryStream(Stream inputStream)
        {
            inputStream.Position = 0;
            var memoryStream = new MemoryStream();
            inputStream.CopyTo(memoryStream);
            memoryStream.Position = 0;
            return memoryStream;
        }

        private static string ReadRequestBody(HttpRequestBase Request, MemoryStream memoryStream)
        {
            memoryStream.Position = 0;
            using (var reader = new StreamReader(memoryStream))
            {
                return reader.ReadToEnd();
            }
        }
        private static string ReadRequestBody(HttpRequest Request, MemoryStream memoryStream)
        {
            memoryStream.Position = 0;
            using (var reader = new StreamReader(memoryStream))
            {
                return reader.ReadToEnd();
            }
        }
        public static string ConvertFormToJsonSingle(string keyname, HttpRequestBase Request)
        {
            Request.InputStream.Position = 0;

            var condList = new List<Dictionary<string, object>>();

            foreach (string key in Request.Form.Keys)
            {
                if (key.Contains("[") && key.Contains("]") && key.StartsWith(keyname + "["))
                {
                    var match = System.Text.RegularExpressions.Regex.Match(key, $@"{keyname}\[(\d+)\]\[(.+?)\]");
                    if (match.Success)
                    {
                        var index = int.Parse(match.Groups[1].Value);
                        var propName = match.Groups[2].Value;

                        // Ensure the list is large enough
                        while (condList.Count <= index)
                        {
                            condList.Add(new Dictionary<string, object>());
                        }

                        condList[index][propName] = Request.Form[key];
                    }
                }
            }
            if (condList.Count > 0)
            {
                return JsonConvert.SerializeObject(condList, Formatting.Indented);

            }
            else
            {
                return "";
            }
        }

        public static string ConvertFormToJsonSingle(string keyname, HttpRequest Request)
        {
            Request.InputStream.Position = 0;

            var condList = new List<Dictionary<string, object>>();

            foreach (string key in Request.Form.Keys)
            {
                if (key.Contains("[") && key.Contains("]") && key.StartsWith(keyname + "["))
                {
                    var match = System.Text.RegularExpressions.Regex.Match(key, $@"{keyname}\[(\d+)\]\[(.+?)\]");
                    if (match.Success)
                    {
                        var index = int.Parse(match.Groups[1].Value);
                        var propName = match.Groups[2].Value;

                        // Ensure the list is large enough
                        while (condList.Count <= index)
                        {
                            condList.Add(new Dictionary<string, object>());
                        }

                        condList[index][propName] = Request.Form[key];
                    }
                }
            }
            if (condList.Count > 0)
            {
                return JsonConvert.SerializeObject(condList, Formatting.Indented);

            }
            else
            {
                return "";
            }
        }


        public static string GetPar(string name, HttpRequestBase Request)
        {


            var memoryStream = CopyToMemoryStream(Request.InputStream);
            memoryStream.Position = 0;

            string contentType = Request.ContentType.ToLower().Replace(" ", "").Trim().Split(';')[0];

            string methodType = Request.HttpMethod.ToUpper();
            string result_value = "";

            // Check in Request.Params
            result_value = FindInCollection(Request.Params, name);

            // Check in Request.Form
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = FindInCollection(Request.Form, name);
            }

            // Convert form data to JSON and search
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = ConvertFormToJsonSingle(name, Request);
            }

            // Check in array-formatted parameters
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = finArray(Request, name);
            }

            // Handle x-www-form-urlencoded body
            if (string.IsNullOrEmpty(result_value) && methodType == "POST" && contentType == "application/x-www-form-urlencoded")
            {
                result_value = FindInBody(Request, name, contentType, memoryStream);
            }

            // Handle JSON body
            if (string.IsNullOrEmpty(result_value) && methodType == "POST" && contentType == "application/json")
            {
                result_value = FindInBody(Request, name, contentType, memoryStream);
            }

            return result_value ?? "";
        }


        public static string GetPar(string name, HttpRequest Request)
        {


            var memoryStream = CopyToMemoryStream(Request.InputStream);
            memoryStream.Position = 0;

            string contentType = Request.ContentType.ToLower().Replace(" ", "").Trim().Split(';')[0];

            string methodType = Request.HttpMethod.ToUpper();
            string result_value = "";

            // Check in Request.Params
            result_value = FindInCollection(Request.Params, name);

            // Check in Request.Form
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = FindInCollection(Request.Form, name);
            }

            // Convert form data to JSON and search
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = ConvertFormToJsonSingle(name, Request);
            }

            // Check in array-formatted parameters
            if (string.IsNullOrEmpty(result_value))
            {
                result_value = finArray(Request, name);
            }

            // Handle x-www-form-urlencoded body
            if (string.IsNullOrEmpty(result_value) && methodType == "POST" && contentType == "application/x-www-form-urlencoded")
            {
                result_value = FindInBody(Request, name, contentType, memoryStream);
            }

            // Handle JSON body
            if (string.IsNullOrEmpty(result_value) && methodType == "POST" && contentType == "application/json")
            {
                result_value = FindInBody(Request, name, contentType, memoryStream);
            }

            return result_value ?? "";
        }

        private static string FindInBody(HttpRequest Request, string name, string contentType, MemoryStream memoryStream)
        {
            memoryStream.Position = 0;
            var body = ReadRequestBody(Request, memoryStream);

            try
            {
                if (contentType == "application/x-www-form-urlencoded")
                {
                    var keyValuePairs = body.Split('&');
                    foreach (var kvp in keyValuePairs)
                    {
                        var keyValue = kvp.Split('=');
                        if (keyValue.Length == 2 && HttpUtility.UrlDecode(keyValue[0]).ToLower() == name.ToLower())
                        {
                            return HttpUtility.UrlDecode(keyValue[1]);
                        }
                    }
                }
                else if (contentType == "application/json")
                {
                    if (!string.IsNullOrWhiteSpace(body))
                    {
                        var jObject = Newtonsoft.Json.Linq.JObject.Parse(body);
                        Newtonsoft.Json.Linq.JToken token = jObject.SelectToken($"$.{name}", errorWhenNoMatch: false);

                        if (token != null)
                        {
                            return token.ToString();
                        }

                        // If token is null, attempt to find dynamically
                        dynamic jsonDynamic = JsonConvert.DeserializeObject<dynamic>(body);
                        foreach (var item in jsonDynamic)
                        {
                            if (item.name == name)
                            {
                                return item.value.ToString();
                            }
                        }
                    }
                }
            }
            catch (JsonReaderException ex)
            {
                // Log the error
                // Example: Logger.LogError(ex, "JSON parsing error in FindInBody");
            }
            catch (Exception ex)
            {
                // Log the error
                // Example: Logger.LogError(ex, "Unexpected error in FindInBody");
            }

            return null;
        }

        private static string FindInBody(HttpRequestBase Request, string name, string contentType, MemoryStream memoryStream)
        {
            memoryStream.Position = 0;
            var body = ReadRequestBody(Request, memoryStream);

            try
            {
                if (contentType == "application/x-www-form-urlencoded")
                {
                    var keyValuePairs = body.Split('&');
                    foreach (var kvp in keyValuePairs)
                    {
                        var keyValue = kvp.Split('=');
                        if (keyValue.Length == 2 && HttpUtility.UrlDecode(keyValue[0]).ToLower() == name.ToLower())
                        {
                            return HttpUtility.UrlDecode(keyValue[1]);
                        }
                    }
                }
                else if (contentType == "application/json")
                {
                    if (!string.IsNullOrWhiteSpace(body))
                    {
                        var jObject = Newtonsoft.Json.Linq.JObject.Parse(body);
                        Newtonsoft.Json.Linq.JToken token = jObject.SelectToken($"$.{name}", errorWhenNoMatch: false);

                        if (token != null)
                        {
                            return token.ToString();
                        }

                        // If token is null, attempt to find dynamically
                        dynamic jsonDynamic = JsonConvert.DeserializeObject<dynamic>(body);
                        foreach (var item in jsonDynamic)
                        {
                            if (item.name == name)
                            {
                                return item.value.ToString();
                            }
                        }
                    }
                }
            }
            catch (JsonReaderException ex)
            {
                // Log the error
                // Example: Logger.LogError(ex, "JSON parsing error in FindInBody");
            }
            catch (Exception ex)
            {
                // Log the error
                // Example: Logger.LogError(ex, "Unexpected error in FindInBody");
            }

            return null;
        }

        private static string FindInCollection(NameValueCollection collection, string name)
        {
            foreach (string key in collection.Keys)
            {
                if (key.ToLower() == name.ToLower())
                {
                    return collection[key];
                }
            }
            return null;
        }

        private static string finArray(HttpRequestBase Request, string name)
        {
            string[] parms = Request.Form.GetValues(name + "[]") ?? new string[0]; // Safely handle null

            if (parms.Length == 0)
            {
                return null;
            }
            else
            {
                return JsonConvert.SerializeObject(parms, Formatting.Indented);
            }
        }
        private static string finArray(HttpRequest Request, string name)
        {
            string[] parms = Request.Form.GetValues(name + "[]") ?? new string[0]; // Safely handle null

            if (parms.Length == 0)
            {
                return null;
            }
            else
            {
                return JsonConvert.SerializeObject(parms, Formatting.Indented);
            }
        }


        public static void log(string message)
        {

            try
            {
                string errst = $"{Environment.NewLine}{message} at {DateTime.Now.ToString()}";
                File.AppendAllText(DBHelper.GetMainPath() + @"\set\errorlog.txt", errst);
            }
            catch
            {
            }


        }
        public static List<ProcParam> ConvertProcParamDataTableToList(DataTable dt)
        {
            var procParamList = new List<ProcParam>();

            foreach (DataRow row in dt.Rows)
            {
                var procParam = new ProcParam
                {
                    Sort = row.IsNull("sort") ? 0 : Convert.ToInt32(row["sort"]),
                    Id = row.IsNull("id") ? 0 : Convert.ToInt32(row["id"]),
                    Name = row.IsNull("name") ? string.Empty : row["name"].ToString(),
                    DataType = row.IsNull("data_type") ? string.Empty : row["data_type"].ToString(),
                    Length = row.IsNull("length") ? 0 : Convert.ToInt32(row["length"]),
                    IsNumeric = row.IsNull("is_numeric") ? false : Convert.ToBoolean(row["is_numeric"])
                };

                procParamList.Add(procParam);
            }


            return procParamList;
        }
        public static HttpResponseMessage GetResponse(string newUrl)
        {
            // Use Task.Run to ensure blocking wait does not cause deadlock in some contexts
            var task = Task.Run(async () => await GetResponseAsync(newUrl));
            return task.Result; // Or task.Wait(); and then return task.Result;
        }
        public static string GetResponseString(string newUrl)
        {
            return Encoding.UTF8.GetString(GetResponse(newUrl).Content.ReadAsByteArrayAsync().Result) ; 
        }
        private static readonly HttpClient _client = new HttpClient();

        public static void FileGet(HttpContext context, string newUrl)
        {

            try
            {

                HttpResponseMessage response = GetResponse(newUrl);

                context.Response.ContentType = response.Content.Headers.ContentType.ToString();
                var data = response.Content.ReadAsStreamAsync().Result;
                data.CopyToAsync(HttpContext.Current.Response.OutputStream).Wait();
                context.Response.Flush();
                context.Response.SuppressContent = true;
                context.Response.End();
                context.ApplicationInstance.CompleteRequest();
            }
            catch (Exception ex)
            {

                context.Response.ContentType = "text/plain";
                //   context.Response.StatusCode = 404;
                context.Response.Write("Exception: " + ex.Message);
                context.Response.Flush();
                context.Response.SuppressContent = true;
                context.Response.End();
                context.ApplicationInstance.CompleteRequest();
            }
        }
        public static async Task<HttpResponseMessage> GetResponseAsync(string newUrl)
        {

            HttpResponseMessage response = await _client.GetAsync(newUrl);
            return response;
        }


        private static bool isObjectname(string name)
        {

            System.Text.RegularExpressions.Regex regexalphnum = new System.Text.RegularExpressions.Regex("^[a-zA-Z0-9_]+$");
            return regexalphnum.IsMatch(name);
        }
        private static bool isObjectExists(string name)
        {

            if (DBHelper.getdata("select name from sys.tables where name ='" + name.Replace("'", "''") + "'").ToLower() != name.ToLower())
            {
                return false;
            }
            else
            {
                return true;

            }

        }

        private static bool isUniID(string id)
        {
            if (id.Length > 36 * 5)
            {
                return false;
            }
            System.Text.RegularExpressions.Regex idpattern = new System.Text.RegularExpressions.Regex("^[a-zA-Z0-9-]+$");
            return idpattern.IsMatch(id);
        }

        public static Mas.com.eg.Models.invoice.Proc_Object Proc_DataTable(string name, string[] parm)
        {
            Mas.com.eg.Models.invoice.Proc_Object proc_Object = new Mas.com.eg.Models.invoice.Proc_Object();

            if (string.IsNullOrEmpty(name))
            {
                proc_Object.Error = "name is empty";
                return proc_Object;
            }
            else if (!isObjectname(name))
            {
                proc_Object.Error = "In Correct name !";
                return proc_Object;
            }
            else if (name.Length < 2 || name.Length > 128)
            {
                proc_Object.Error = "In name length !";
                return proc_Object;
            }
            else if (DBHelper.Getdata_exec("select name from sys.procedures where name ='" + name.Replace("'", "''") + "'").ToLower() != name.ToLower())
            {
                string name2 = DBHelper.Getdata_exec("select name from sys.procedures where name ='" + name.Replace("'", "''") + "'").ToLower();
                proc_Object.Error = $"its not procedure by this name {name.ToLower()} != {name2} !";
                return proc_Object;
            }
            else
            {
                string countParms = DBHelper.Getdata_exec("select Count(*) From sys.parameters where object_id =object_id('" + name.Replace("'", "''") + "')");
                int countParmsnum = 0;

                try
                {
                    countParmsnum = Convert.ToInt16(countParms);


                }
                catch (Exception ex)
                {

                }

                if (countParmsnum != parm.Length)
                {
                    proc_Object.Error = $"Wrong parameters count ({countParmsnum.ToString()}) != ({parm.Length.ToString()})   !";
                    return proc_Object;
                }
                else
                {
                    DataTable dt = DBHelper.Ex_Gettabel_Main("select Pp.sort, Pp.id, Pp.name, Pp.data_type, Pp.length, Pp.is_numeric from Proc_parm('" + name.Replace("'", "''") + "') Pp");
                    List<Mas.com.eg.Models.invoice.ProcParam> procparamlist = Mas.com.eg.Models.invoice.ConvertProcParamDataTableToList(dt);

                    if (procparamlist.Count != parm.Length)
                    {
                        proc_Object.Error = "Wrong parameters count list !";
                        return proc_Object;
                    }

                    string[] slparams = new string[parm.Length];
                    int parmindex = 0;

                    foreach (Mas.com.eg.Models.invoice.ProcParam parmo in procparamlist)
                    {
                        try
                        {
                            string currval = parm[parmindex];
                            currval = currval.Trim('"');
                            if (parmo.IsNumeric)
                            {
                                if (!decimal.TryParse(currval, out _))
                                {
                                    proc_Object.Error = "parameter " + parmo.Name + " not N datatype  ! : ";
                                    return proc_Object;
                                }
                                slparams[parmindex] = currval;
                            }
                            else if (parmo.DataType.ToLower() == "bit")
                            {
                                if (currval == "0" || currval == "1")
                                {
                                    slparams[parmindex] = currval;
                                }
                                else if (currval.ToLower() == "true" || currval.ToLower() == "false")
                                {
                                    slparams[parmindex] = "'" + currval + "'";
                                }
                                else
                                {
                                    proc_Object.Error = "parameter " + parmo.Name + " not bit datatype  ! : ";
                                    return proc_Object;
                                }
                            }
                            else if (parmo.DataType.ToLower().StartsWith("n"))
                            {
                                slparams[parmindex] = "N'" + currval.Replace("'", "''") + "'";
                            }
                            else
                            {
                                slparams[parmindex] = "'" + currval.Replace("'", "''") + "'";
                            }
                        }
                        catch (Exception ex)
                        {
                            proc_Object.Error = "parameter " + parmo.Name + " Error ! : " + ex.Message;
                            return proc_Object;
                        }
                        parmindex += 1;
                    }
                    string sl = name + " " + string.Join(",", slparams);
                    proc_Object.sl = Hash.Uni.EncryptStringAES(sl, "sqlencme");
                    proc_Object = DBHelper.proc_result(sl);

                    proc_Object.requestData = invoice.request_data(HttpContext.Current.Request);


                }
            }

            return proc_Object;
        }



        public static Mas.com.eg.Models.invoice.Proc_Object fun_DataTable(string name, string[] parm)
        {
            Mas.com.eg.Models.invoice.Proc_Object proc_Object = new Mas.com.eg.Models.invoice.Proc_Object();

            if (string.IsNullOrEmpty(name))
            {
                proc_Object.Error = "name is empty";
                return proc_Object;
            }
            else if (!isObjectname(name))
            {
                proc_Object.Error = "In Correct name !";
                return proc_Object;
            }
            else if (name.Length < 2 || name.Length > 128)
            {
                proc_Object.Error = "In name length !";
                return proc_Object;
            }
            else if (DBHelper.Getdata_exec("select name from sys.objects where type_desc  in ('SQL_TABLE_VALUED_FUNCTION','SQL_INLINE_TABLE_VALUED_FUNCTION') and name ='" + name.Replace("'", "''") + "'").ToLower() != name.ToLower())
            {
                proc_Object.Error = $"its not function by this name {name.ToLower()}  !";
                return proc_Object;
            }
            else
            {
                string countParms = DBHelper.Getdata_exec("select Count(*) From sys.parameters where object_id =object_id('" + name.Replace("'", "''") + "')");
                int countParmsnum = 0;

                try
                {
                    countParmsnum = Convert.ToInt16(countParms);


                }
                catch (Exception ex)
                {

                }

                if (countParmsnum != parm.Length)
                {
                    proc_Object.Error = $"Wrong parameters count ({countParmsnum.ToString()}) != ({parm.Length.ToString()})   !";
                    return proc_Object;
                }
                else
                {
                    DataTable dt = DBHelper.Ex_Gettabel_Main("select Pp.sort, Pp.id, Pp.name, Pp.data_type, Pp.length, Pp.is_numeric from Proc_parm('" + name.Replace("'", "''") + "') Pp");
                    List<Mas.com.eg.Models.invoice.ProcParam> procparamlist = Mas.com.eg.Models.invoice.ConvertProcParamDataTableToList(dt);

                    if (procparamlist.Count != parm.Length)
                    {
                        proc_Object.Error = "Wrong parameters count list !";
                        return proc_Object;
                    }

                    string[] slparams = new string[parm.Length];
                    int parmindex = 0;

                    foreach (Mas.com.eg.Models.invoice.ProcParam parmo in procparamlist)
                    {
                        try
                        {
                            string currval = parm[parmindex];
                            if (parmo.IsNumeric)
                            {
                                if (!decimal.TryParse(currval, out _))
                                {
                                    proc_Object.Error = "parameter " + parmo.Name + " not N datatype  ! : ";
                                    return proc_Object;
                                }
                                slparams[parmindex] = currval.Trim('"');
                            }
                            else if (parmo.DataType.ToLower() == "bit")
                            {
                                if (currval == "0" || currval == "1")
                                {
                                    slparams[parmindex] = currval.Trim('"');
                                }
                                else if (currval.ToLower() == "true" || currval.ToLower() == "false")
                                {
                                    slparams[parmindex] = "'" + currval.Trim('"') + "'";
                                }
                                else
                                {
                                    proc_Object.Error = "parameter " + parmo.Name + " not bit datatype  ! : ";
                                    return proc_Object;
                                }
                            }
                            else if (parmo.DataType.ToLower().StartsWith("n"))
                            {
                                slparams[parmindex] = "N'" + currval.Replace("'", "''").Trim('"') + "'";
                            }
                            else
                            {
                                slparams[parmindex] = "'" + currval.Replace("'", "''").Trim('"') + "'";
                            }
                        }
                        catch (Exception ex)
                        {
                            proc_Object.Error = "parameter " + parmo.Name + " Error ! : " + ex.Message;
                            return proc_Object;
                        }
                        parmindex += 1;
                    }
                    string sl = "select * from " + name + "  (" + string.Join(",", slparams) + ")" ;
                   
                    proc_Object = DBHelper.proc_result(sl);
                    proc_Object.sl = Hash.Urlx.Encrypturl(sl, "154455695");
                    proc_Object.parms = parm;


                    proc_Object.requestData = invoice.request_data(HttpContext.Current.Request);


                }
            }

            return proc_Object;
        }

        public static object request_data(HttpRequestBase Request)
        {
            var queryString = new Dictionary<string, string>();
            foreach (var key in Request.QueryString.AllKeys)
            {
                queryString[key] = Request.QueryString[key];
            }

            var form = new Dictionary<string, string>();
            foreach (var key in Request.Form.AllKeys)
            {
                form[key] = Request.Form[key];
            }

            var headers = new Dictionary<string, string>();
            foreach (var key in Request.Headers.AllKeys)
            {
                headers[key] = Request.Headers[key];
            }

            var @params = new Dictionary<string, string>();
            foreach (var key in Request.Params.AllKeys)
            {
                @params[key] = Request.Params[key];
            }
            var memoryStream = CopyToMemoryStream(Request.InputStream);

            var bodyData = ReadRequestBody(Request, memoryStream);

            var requestData = new
            {
                Params = @params,
                QueryString = queryString,
                Form = form,
                Headers = headers,
                bodydata = bodyData,
                conddata = ConvertFormToJsonSingle("cond", Request)

            };

            return requestData;
        }
        public static object request_data(HttpRequest Request)
        {
            var queryString = new Dictionary<string, string>();
            foreach (var key in Request.QueryString.AllKeys)
            {
                queryString[key] = Request.QueryString[key];
            }

            var form = new Dictionary<string, string>();
            foreach (var key in Request.Form.AllKeys)
            {
                form[key] = Request.Form[key];
            }

            var headers = new Dictionary<string, string>();
            foreach (var key in Request.Headers.AllKeys)
            {
                headers[key] = Request.Headers[key];
            }

            var @params = new Dictionary<string, string>();
            foreach (var key in Request.Params.AllKeys)
            {
                @params[key] = Request.Params[key];
            }
            var memoryStream = CopyToMemoryStream(Request.InputStream);

            var bodyData = ReadRequestBody(Request, memoryStream);

            var requestData = new
            {
                Params = @params,
                QueryString = queryString,
                Form = form,
                Headers = headers,
                bodydata = bodyData,
                conddata = ConvertFormToJsonSingle("cond", Request)

            };

            return requestData;
        }

        public static string getJson(string name, string top, string page, string cond, string cols,string order, HttpRequestBase Request, string compid, string langcode)
        {
            Table_info_st tbinfo = new Table_info_st();
       

            string dataResult = "";
            if (top == "")
            {
                top = "100";
            }
            if (page == "")
            {
                page = "1";
            }

            int topget = 100;

            try
            {
                topget = Convert.ToInt16(top);
            }
            catch
            {

            }
            int pageget = 1;

            try
            {
                pageget = Convert.ToInt16(page);
            }
            catch
            {

            }
            if (!isUniID(compid) && (compid.Length == 32 || compid.Length == 36))
            {
                dataResult = "{\"error\":\"Wrong compid  !\"}";
            }
            else
            {
                if (!IsAlphabeticAndLengthTwo(langcode))
                {
                    dataResult = "{\"error\":\"Wrong langcode  !\"}";
                }
                else
                {
                    if (name.Length < 2)
                    {


                        var errordata = new
                        {
                            error = "Wrong object name L !" + name,
                            request_info = request_data(Request)

                        };
                        dataResult = JsonConvert.SerializeObject(errordata, Formatting.Indented);
                    }
                    else
                    {

                        if (!isObjectname(name))
                        {
                            dataResult = "{\"error\":\"Wrong object name T !\"}";
                        }
                        else
                        {


                            DataTable dt_obj = DBHelper.gettabel("select  s.name,s.object_id,s.principal_id,s.schema_id,s.parent_object_id,s.type,s.type_desc,s.create_date,s.modify_date  from  sys.objects s where s.name ='" + name + "' ");
                            if (dt_obj.Rows.Count == 0)
                            {
                                dataResult = "{\"error\":\"Wrong object name N !\"}";

                            }
                            else if (dt_obj.Rows[0]["type_desc"].ToString() == "USER_TABLE")
                            {
                                tbinfo.name = name;
                                string object_id = dt_obj.Rows[0]["object_id"].ToString();
                                List<conds> condslist = new List<conds>();
                                List<columns> colslist = new List<columns>();
                                List<OrdersList> orderslist = new List<OrdersList>();

                                string slcols = " select  Gc.id,Gc.name,Gc.trans_name,Gc.type,Gc.is_nullable,Gc.ReferencedTable,Gc.referenced_column_id,Gc.ReferencedColumnName,Gc.search_columns,Gc.all_columns ,Gc.length  from  GetTableColumnInfo_company   (" + object_id + ",N'" + compid + "','" + langcode + "')  Gc";
                                DataTable coltable = DBHelper.gettabel(slcols);
                                string jsonString = JsonConvert.SerializeObject(coltable, Formatting.Indented);

                                try
                                {

                                    colslist = columnsDataTableToList(coltable);

                                }
                                catch (Exception err)
                                {
                                    dataResult = "{\"error\":\" " + err.Message + "  !\",\"sl\":\"" + slcols + "\",\"data\" :" + jsonString + "}";

                                }
                                if (cond.Length > 0)
                                {
                                    string cond_string = "";
                                    try
                                    {
                                        //  cond_string = Hash.base64.Decode(cond_stringbase64);
                                        cond_string = cond;
                                    }
                                    catch (Exception err)
                                    {
                                        cond_string = "";
                                    }


                                    if (cond_string == "")
                                    {

                                        dataResult = "{\"error\":\"Wrong code cond  !\"}";

                                    }
                                    else
                                    {
                                        condslist = Newtonsoft.Json.JsonConvert.DeserializeObject<List<conds>>(cond_string);
                                        if (condslist.Count == 0)
                                        {
                                            dataResult = "{\"error\":\"Wrong cond format js  !\"}";

                                        }
                                        else
                                        {
                                            foreach (conds cond_data in condslist)
                                            {

                                                string colname = cond_data.column_name;

                                                if (!isObjectname(colname) || colname is null)
                                                {
                                                    dataResult = "{\"error\":\"Wrong column name cond T !\"}";

                                                    break;
                                                }
                                                else
                                                {


                                                }


                                            }



                                        }



                                    }

                                
                                }

                                if (order != "" && order != null)
                                {


                                    orderslist = Newtonsoft.Json.JsonConvert.DeserializeObject<List<OrdersList>>(order);
                                    if (orderslist.Count == 0)
                                    {
                                        dataResult = "{\"error\":\"Wrong order format list json  !\"}";

                                    }
                                    else
                                    {
                                        foreach (OrdersList orderx in orderslist)
                                        {

                                            string colname = orderx.column_name;

                                            if (!isObjectname(colname) || colname is null)
                                            {
                                                dataResult = "{\"error\":\"Wrong column name OrdersList x !\"}";

                                                break;
                                            }
                                            else
                                            {


                                            }


                                        }



                                    }


                                }


                                if (dataResult == "")

                                {
                                    //  DataTable colsinfo = DBHelper.gettabel("select * ,type_name(system_type_id) as colty from sys.columns where object_id = " + object_id);



                                    bool foundCompanyId = false;
                                    foreach (columns cinfo in colslist)
                                    {
                                        if (cinfo.name.ToLower() == "company_id")
                                        {
                                            foundCompanyId = true;
                                            break; // Stop checking once we've found it
                                        }
                                    }

                                    if (foundCompanyId)
                                    {


                                        conds condcomp = new conds();

                                        condcomp.column_name = "company_id";
                                        condcomp.cond = "=";
                                        condcomp.value = compid;
                                        condcomp.cond_type = "AND";
                                        condcomp.column_name_type = "id";
                                        condcomp.datatype = "nvarchar(60)";
                                        condcomp.Children = condslist;

                                        List<conds> newcondl = new List<conds>();
                                        newcondl.Add(condcomp);
                                        condslist = newcondl;




                                    }

                                }

                                if (dataResult == "")

                                {
                                    tbinfo.cond = condslist;
                                    tbinfo.ordersList= orderslist;

                                    if (cols == "")
                                    {

                                        cols = "*";
                                    }
                                    List<columns> newCols = new List<columns>();

                                    if (cols != "*")

                                    {
                                        string[] cols_arr = cols.Split(',');

                                        foreach (string coln in cols_arr)
                                        {
                                            bool foundcolname = false;
                                            foreach (columns cinfo in colslist)
                                            {
                                                if (cinfo.name.ToLower() == coln.ToLower())
                                                {
                                                    newCols.Add(cinfo);
                                                    foundcolname = true;

                                                    break; // Stop checking once we've found it
                                                }
                                            }
                                            if (!foundcolname)
                                            {
                                                var errordata = new
                                                {
                                                    error = "Wrong colnames data  1 !",


                                                };
                                                dataResult = JsonConvert.SerializeObject(errordata, Formatting.Indented);

                                                break; // Stop checking once we've found it
                                            }
                                        }

                                    }
                                    else
                                    {

                                        newCols = colslist;



                                    }
                                    if (dataResult == "")
                                    {

                                        if (newCols.Count == 0)
                                        {
                                            dataResult = "{\"error\":\"Wrong colnames data count   2!\"}";

                                        }
                                        else
                                        {

                                            string colsselect = String.Join("," + name + ".", newCols);
                                            colsselect = colsselect.Substring(1, colsselect.Length - 1);



                                            Queryarr queryarrend = GenerateQuery(topget, pageget, name, newCols, tbinfo.cond, colslist,orderslist);
                                            string sl = queryarrend.sl;

                                            tbinfo.columns = newCols;
                                            tbinfo.sl = Hash.Uni.EncryptStringAES(sl, "sqlencme");
                                            tbinfo.top = topget;
                                            tbinfo.page = pageget;
                                            tbinfo.count = DBHelper.getdatai(queryarrend.contsl);
                                            tbinfo.data = DBHelper.gettabel(sl);
                                            tbinfo.allcolumns = DBHelper.getdata("select cols from table_columns_names('" + name + "')");
                                            tbinfo.table_childs = DBHelper.gettabel("select * from Table_childs_data('" + name + "','" + compid + "','" + langcode + "')");

                                            tbinfo.request_info = request_data(Request);
                                            dataResult = JsonConvert.SerializeObject(tbinfo, Formatting.Indented);
                                            try
                                            {

                                            }
                                            catch (ArgumentException ex)
                                            {
                                                // Handle known argument errors, possibly logging the error

                                                dataResult = "{\"error\":\" query error ArgumentException " + ex.Message.Replace("\"", "'") + "   !\"}";

                                            }
                                            catch (Exception ex)
                                            {
                                                // Handle unexpected errors
                                                dataResult = "{\"error\":\" query error Exception " + ex.Message.Replace("\"", "'") + "   !\"}";
                                            }


                                        }
                                    }



                                }




                            }

                            else
                            {
                                dataResult = "{\"error\":\"Not supported  object " + dt_obj.Rows[0]["type_desc"].ToString() + " yet !\"}";

                            }
                        }


                    }
                }
            }


            return dataResult;
        }
        public static Queryarr GenerateQuery(int top, int page, string baseTableName, List<columns> colsList, List<conds> condsList, List<columns> standardcolsList,List<OrdersList> ordersLists)
        {

            Queryarr queryarr = new Queryarr();
            int tableAliasCounter = 1;
            Dictionary<string, string> tableAliases = new Dictionary<string, string>();

            // Building SELECT clause
            string selectClause = string.Join(", ", colsList.Select(col =>
            {
                if (col.isreferences)
                {
                    string alias = col.ReferencedTable + tableAliasCounter++;
                    tableAliases[col.name] = alias;  // Store alias based on column name for use in JSON string and JOIN clause
                    return $"CAST('{{\"value\": \"' +  CAST( trim( replace( replace(replace( {alias}.{col.ReferencedColumnName},char(10),'\\n'),CHAR(13),'\\r'),'\"',' ')) AS NVARCHAR(max) ) + '\", ' + " +
                           $" '\"id\": \"' + CAST({baseTableName}.{col.name} AS NVARCHAR(60)) + '\"}}' AS NVARCHAR(max)) AS {col.name}";
                }
                else
                {
                    return $"{baseTableName}.{col.name} AS {col.name}";
                }
            }));

            string query = $"SELECT  {selectClause} FROM {baseTableName}";

            // Building JOIN clauses
            foreach (var col in colsList.Where(col => col.isreferences))
            {
                string alias = tableAliases[col.name];
                string joinClause = $"LEFT OUTER JOIN {col.ReferencedTable} {alias} ON {baseTableName}.{col.name} = {alias}.ID";
                query += " " + joinClause;
            }
            queryarr.basesl = query;
            string condsl = "";
            // Building WHERE clause dynamically
            if (condsList.Any())
            {
                string whereClause = BuildCondition(baseTableName, tableAliases, colsList, condsList);
                condsl += $" WHERE {whereClause}";
            }
            queryarr.condsl = condsl;
            
            queryarr.contsl = "select Count(*) from " + baseTableName + " " + condsl   ;
            query += condsl;
            // Determine the ORDER BY clause dynamically
            string pageingOrder = DetermineOrdering(baseTableName, colsList, standardcolsList, page, top,ordersLists);
            queryarr.ordersl = pageingOrder;
            query += $" {pageingOrder}";
            queryarr.sl = query;
            // query += " FOR JSON AUTO";
            return queryarr;
        }

        private static string DetermineOrdering(string baseTableName, List<columns> colsList, List<columns> standardcolsList, int pageNumber, int pageSize,List<OrdersList> ordersLists)
        {
            string orderByClause = "ORDER BY 1"; // Default order by the first column
            string ordersl = BuildOrder( ordersLists);

            if(ordersl != "")
            {
                orderByClause = ordersl;

            }
            else
            {            // Check if 'begin_date' exists and order by it if it does

                var dateColumn = standardcolsList.FirstOrDefault(col => col.name.Equals("begin_date", StringComparison.OrdinalIgnoreCase));
                if (dateColumn != null)
                {
                    orderByClause = $"ORDER BY {baseTableName}.{dateColumn.name} DESC";
                }
                else
                {
                    // Find the first nvarchar column that isn't 'ID'
                    var nvarcharColumn = colsList.FirstOrDefault(col => col.type.Contains("char") && !col.name.Equals("ID", StringComparison.OrdinalIgnoreCase));
                    if (nvarcharColumn != null)
                    {
                        orderByClause = $"ORDER BY {baseTableName}.{nvarcharColumn.name}";
                    }
                }
            }
           

            // Calculate OFFSET and FETCH based on the page number and page size
            int offset = (pageNumber - 1) * pageSize;
            string pagingClause = $"OFFSET {offset} ROWS FETCH NEXT {pageSize} ROWS ONLY";

            return $"{orderByClause} {pagingClause}";
        }
        public static Delete_response delete(string baseTableName, string rowid)
        {

            Delete_response delete_response = new Delete_response();


            if (!isObjectname(baseTableName))
            {
                delete_response.error = " Wrong delete pattern object name ! ";
                return delete_response;
            }
            if (!isUniID(rowid))
            {
                delete_response.error = " Wrong delete pattern rowid name ! ";
                return delete_response;
            }

            if (!isObjectExists(baseTableName))
            {
                delete_response.error = " Wrong delete  object name 2 ! ";
                return delete_response;
            }
            string sl = "delete " + baseTableName.Replace("'", "") + " where id ='" + rowid.Replace("'", "''") + "'";

            delete_response.name = baseTableName;
            delete_response.rowid = rowid;
            delete_response.sl = Hash.Uni.EncryptStringAES(sl, "sqlencme");
            string resstring = DBHelper.Exceutsql_res(sl);
            int rescount = 0;
            try
            {
                rescount = Convert.ToInt16(resstring);
            }
            catch (Exception ex)
            {
                delete_response.error = resstring;
            }
            delete_response.records_affected_count = rescount;
            return delete_response;

        }
        private static string BuildCondition(string baseTableName, Dictionary<string, string> tableAliases, List<columns> colsList, List<conds> condsList)
        {

            List<string> whereClauses = new List<string>();
            foreach (var cond in condsList)
            {
                // string datatype = DBHelper.getdata(" select type_name( system_type_id) from sys.columns object_id =object_id('" + baseTableName.Replace("'", "") + "') and name ='" + cond.column_name.Replace("'", "") + "'");

                //     datatype = datatype.ToLower();
                string field;
                var col = colsList.Find(c => c.name.ToLower() == cond.column_name.ToLower()); // Correctly using Find with a lambda expression

                if (cond.column_name_type == "id")
                {
                    field = $"{baseTableName}.{cond.column_name}"; // Direct column reference in the main table
                }
                else
                {
                    if (col != null && col.isreferences)
                    {
                        field = $"{tableAliases[col.name]}.{col.ReferencedColumnName}"; // Referencing the foreign key's referenced column
                    }
                    else
                    {
                        field = $"{baseTableName}.{cond.column_name}"; // Fallback to direct column if not found or not referenced
                    }

                }
                string coltype = cond.datatype;

                if (col != null)
                {
                    if (col.type != null)
                    {
                        coltype = col.type;
                        cond.datatype = col.type;
                    }
                }
                string currentClause = $"{field} {cond.cond.Replace("len", "")} {FormatValue(cond.cond, cond.value, coltype)}";

                // Handling children conditions
                if (cond.Children.Any())
                {
                    string childConditions = BuildCondition(baseTableName, tableAliases, colsList, cond.Children);
                    currentClause = $"({currentClause} {cond.Children_type} ({childConditions}))";
                }

                whereClauses.Add(currentClause);
            }
            return string.Join($" {condsList.First().cond_type} ", whereClauses);
        }
        private static string BuildOrder( List<OrdersList> ordersLists)
        {
            if (ordersLists == null || ordersLists.Count == 0)
                return string.Empty;

            List<string> orderClauses = new List<string>();

            foreach (var orderItem in ordersLists)
            {
               

                string direction = orderItem.order.Equals("DESC", StringComparison.OrdinalIgnoreCase)
                                   ? "DESC" : "ASC";

                orderClauses.Add($"{orderItem.column_name} {direction}");
            }

            return orderClauses.Count > 0
                   ? "ORDER BY " + string.Join(", ", orderClauses)
                   : string.Empty;
        }


        private static string FormatValue(string cond, string value, string datatype)
        {
            // Handling string types with SQL injection prevention
            datatype = datatype.Split('(')[0];
            datatype = datatype.Replace(" ", "").Trim();
            datatype = datatype.ToLower();
            if (datatype.Contains("char"))
            {
                switch (cond)
                {
                    case "like":
                        return $"N'%{EscapeSQL(value)}%'";
                    case "startwith":
                        return $"N{EscapeSQL(value)}%'";
                    case "endwith":
                        return $"N'%{EscapeSQL(value)}'";
                    case ">len":
                        return $"len(%{EscapeSQL(value)})";
                    case "<len":
                        return $"len(%{EscapeSQL(value)})";
                    case "<=len":
                        return $"len(%{EscapeSQL(value)})";
                    case ">=len":
                        return $"len(%{EscapeSQL(value)})";
                    case "in":
                        return FormatInCondition(value);
                    case "between":
                        return FormatBetweenCondition(value, datatype.ToLower());
                    default:
                        return $"N'{EscapeSQL(value)}'";
                }
            }
            // Handling numeric and date types without quotes, add more specific handling as needed
            else if (datatype == "int" || datatype == "decimal" || datatype == "float" ||
                     datatype == "date" || datatype == "datetime" || datatype == "time")
            {
                if (cond == "between")
                {
                    value = FormatBetweenCondition(value, datatype.ToLower());
                    return value;

                }
                else
                {
                    if (IsValidForType(value, datatype))
                    {
                        return value;
                    }
                    throw new ArgumentException($"Invalid value for datatype {datatype}: {value}");
                }



            }

            // Fallback for unhandled types, consider logging or handling specific cases as necessary
            return value;
        }

        private static string EscapeSQL(string value)
        {
            // Replace single quotes to prevent SQL injection
            return value.Replace("'", "''");
        }

        private static string FormatInCondition(string value)
        {
            var values = value.Split(',');
            var escapedValues = values.Select(v => $"N'{EscapeSQL(v.Trim())}'");
            return $"({string.Join(", ", escapedValues)})";
        }
        private static string FormatBetweenCondition(string value, string type)
        {
            value = value.Replace(" ", "");
            if (!value.Contains("and"))
            {
                throw new ArgumentException($"Invalid value for between and  format !");

            }
            string[] separators = new string[] { "and" };
            string[] values = value.Split(separators, StringSplitOptions.None);
            if (values.Length != 2)
            {

                throw new ArgumentException($"Invalid values for between count  format !");

            }

            System.Collections.Generic.IEnumerable<string> escapedValues;

            if (type.ToLower().Contains("date") || type.ToLower().Contains("time"))
            {
                escapedValues = values.Select(v => $"'{EscapeSQL(v.Trim())}'");
            }
            else
            {
                foreach (string v in values)
                {
                    if (!IsValidForType(v, type))
                    {
                        throw new ArgumentException($"Invalid values for between count  format !");

                    }
                }
                escapedValues = values.Select(v => v.Trim().Replace("'", ""));

            }

            return string.Join(" and ", escapedValues);
        }
        private static bool IsValidForType(string value, string datatype)
        {
            // Example: Add validation logic for different datatypes
            if (datatype.Contains("int"))
            {
                return int.TryParse(value, out _);
            }
            else if (datatype.Contains("decimal") || datatype.Contains("float"))
            {
                return decimal.TryParse(value, out _);
            }
            else if (datatype.Contains("datetime") || datatype.Contains("date"))
            {
                return DateTime.TryParse(value, out _);
            }
            else if (datatype.Contains("time"))
            {
                return TimeSpan.TryParse(value, out _);
            }
            return true; // Assume valid if not specifically checked
        }



        private static List<columns> columnsDataTableToList(DataTable table)
        {
            List<columns> list = new List<columns>();
            foreach (DataRow row in table.Rows)
            {
                int length = 0;
                try
                {
                    length = Convert.ToInt16(row["length"].ToString());
                }
                catch (Exception)
                {


                }

                columns column = new columns()
                {
                    id = row["id"] != DBNull.Value ? Convert.ToInt32(row["id"]) : 0,
                    name = row["name"] != DBNull.Value ? row["name"].ToString() : null,
                    trans_name = row["trans_name"] != DBNull.Value ? row["trans_name"].ToString() : null,

                    type = row["type"] != DBNull.Value ? row["type"].ToString() : null,
                    is_nullable = row["is_nullable"] != DBNull.Value ? Convert.ToBoolean(row["is_nullable"]) : false,
                    ReferencedTable = row["ReferencedTable"] != DBNull.Value ? row["ReferencedTable"].ToString() : null,
                    referenced_column_id = row["referenced_column_id"] != DBNull.Value ? Convert.ToInt32(row["referenced_column_id"]) : 0,
                    ReferencedColumnName = row["ReferencedColumnName"] != DBNull.Value ? row["ReferencedColumnName"].ToString() : null,
                    isreferences = row["ReferencedTable"] != DBNull.Value && !string.IsNullOrEmpty(row["ReferencedTable"].ToString()),
                    search_columns = row["search_columns"] != DBNull.Value ? row["search_columns"].ToString() : null,
                    all_columns = row["all_columns"] != DBNull.Value ? row["all_columns"].ToString() : null,
                    length = length


                };
                list.Add(column);
            }
            return list;
        }
        public class Table_info
        {
            public string name { get; set; }
            public List<object> data { get; set; }
            public List<columns> columns { get; set; }
            public string sl { get; set; }



        }
        public class Delete_response
        {
            public string name { get; set; }
            public string rowid { get; set; }
            public int records_affected_count { get; set; }
            public string error { get; set; }

            public string sl { get; set; }


        }
        public class ProcParam
        {
            public int Sort { get; set; }
            public int Id { get; set; }
            public string Name { get; set; }
            public string DataType { get; set; }
            public int Length { get; set; }
            public bool IsNumeric { get; set; }
        }
        public class Proc_Object
        {
            public DataTable data { get; set; }
            public string sl { get; set; }
            public string Error { get; set; }
            public int RecordsAffected { get; set; }
            public int msec { get; set; }
            public string[] parms { get; set; }
            public dynamic requestData { get; set; }

        }
        public class Queryarr
        {
            public string basesl { get; set; }
            public string agvsl { get; set; }
            public string contsl { get; set; }
            public string condsl { get; set; }

            public string ordersl { get; set; }
            public string sl { get; set; }


        }
        public class Table_info_st
        {
            public string name { get; set; }
            public List<columns> columns { get; set; }
            public DataTable data { get; set; }
            public string sl { get; set; }
            public int top { get; set; }
            public int page { get; set; }
            public int count { get; set; }

            public List<conds> cond { get; set; }
            public List<OrdersList> ordersList { get; set; }

            public object request_info { get; set; }
            public string allcolumns { get; set; }
            public DataTable table_childs { get; set; }

        }
        public class columns
        {
            public int id { get; set; }
            public string name { get; set; }
            public string trans_name { get; set; }

            public string type { get; set; }
            public bool isreferences { get; set; }
            public bool is_nullable { get; set; }
            public string ReferencedTable { get; set; }
            public int referenced_column_id { get; set; }
            public string ReferencedColumnName { get; set; }
            public string search_columns { get; set; }
            public string all_columns { get; set; }
            public int length { get; set; }



        }
        public static bool IsAlphabeticAndLengthTwo(string input)
        {
            // Check if the input is not null and has a length of 2
            if (input == null || input.Length != 2)
            {
                return false;
            }

            // Check if the input consists only of alphabetic characters
            return System.Text.RegularExpressions.Regex.IsMatch(input, "^[a-zA-Z]{2}$");
        }

        public class conds
        {
            public string column_name { get; set; }
            private string _cond = "=";  // Default condition
            public string cond
            {
                get => _cond;
                set
                {
                    if (IsValidCondition(value))
                        _cond = value;
                    else
                        throw new ArgumentException("Invalid value for cond. Allowed values are '=', '>', '<', '>=', '<=', '<>', 'like', 'startwith', 'endwith', 'in', '=len', '>=len', '<=len', '>len', '<len','between'.");
                }
            }
            private string _cond_type = "and";  // Default logical operator
            public string cond_type
            {
                get => _cond_type;
                set
                {
                    if (value.ToLower() == "and" || value.ToLower() == "or")
                        _cond_type = value.ToLower();  // Ensure that cond_type is either 'and' or 'or'
                    else
                        throw new ArgumentException("Invalid value for cond_type. Only 'and' or 'or' are allowed.");
                }
            }
            public string value { get; set; }
            private string _datatype = "nvarchar(1000)";  // Default data type
            public string datatype
            {
                get => _datatype;
                set
                {
                    value = value.ToLower();
                    if (IsValidDataType(value))
                        _datatype = value;
                    else
                        throw new ArgumentException("Invalid SQL data type specified.");
                }
            }
            private string _column_name_type = "id";  // Default reference type
            public string column_name_type
            {
                get => _column_name_type;
                set
                {
                    if (value == "id" || value == "name")
                        _column_name_type = value;
                    else
                        throw new ArgumentException("Invalid column_name_type value. Only 'id' or 'name' are allowed.");
                }
            }
            private string _Children_type = "and";  // Default logical operator
            public string Children_type
            {
                get => _Children_type;
                set
                {
                    if (value.ToLower() == "and" || value.ToLower() == "or")
                        _Children_type = value.ToLower();  // Ensure that cond_type is either 'and' or 'or'
                    else
                        throw new ArgumentException("Invalid value for cond_type. Only 'and' or 'or' are allowed.");
                }
            }
            public List<conds> Children { get; set; } = new List<conds>();  // Nested conditions

            public conds()
            {
                Children = new List<conds>();
            }
            private bool IsValidCondition(string condition)
            {
                string[] validConditions = { "=", ">", "<", ">=", "<=", "<>", "!=", "like", "startwith", "endwith", "in", "between" };
                return validConditions.Contains(condition);
            }
            private bool IsValidDataType(string dataType)
            {
                // Basic validation for common types, could be extended to include all SQL Server types and formats
                string[] parts = dataType.ToLowerInvariant().Split('(');
                string baseType = parts[0];
                string[] validTypes = new string[] {
            "int", "bigint", "smallint", "tinyint", "bit", "decimal", "numeric",
            "money", "smallmoney", "float", "real", "date", "datetime", "datetime2",
            "smalldatetime", "char", "varchar", "text", "nchar", "nvarchar", "ntext",
            "binary", "varbinary", "image", "uniqueidentifier", "timestamp", "xml", "json"
        };

                if (validTypes.Contains(baseType))
                {
                    // Further validation for types that include precision/scale
                    if (baseType == "decimal" || baseType == "numeric" || baseType == "varchar" || baseType == "nvarchar" || baseType == "varbinary")
                    {
                        if (parts.Length > 1)
                        {
                            string parameters = parts[1].TrimEnd(')');
                            return parameters.Split(',').All(p => int.TryParse(p.Trim(), out int _));
                        }
                    }
                    return true;
                }
                return false;
            }
        }

        public class OrdersList
        {
            public string column_name { get; set; }

            private string _order = "asc";

            public string order
            {
                get => _order;
                set
                {
                    if (value.ToLower() == "asc" || value.ToLower() == "desc")
                        _order = value.ToLower();
                    else
                        throw new ArgumentException("Invalid value for order. Only 'asc' or 'desc' are allowed.");
                }
            }
        }

        public class dataResponce
        {

            public string insertSQL { get; set; }
            public string updateSQL { get; set; }
            public int countInsertResult { get; set; }
            public int countUpdateResult { get; set; }
            public string insertResult { get; set; }
            public string updateResult { get; set; }


        }


        public static string save(string data)
        {
            string dataResult = "";

            List<dataResponce> dtlist = new List<dataResponce>();
            List<Table_info> infolist = Newtonsoft.Json.JsonConvert.DeserializeObject<List<Table_info>>(data);
            foreach (Table_info info in infolist)
            {
                string columns = "";

                string columnsIns = "";
                string columnsPar = "";
                string updateState = "";
                foreach (columns colinfo in info.columns)
                {
                    columns += colinfo.name + ",";

                    if (colinfo.name.ToLower() == "invoice_number" || colinfo.name.ToLower() == "header_number" || colinfo.name.ToLower() == "document_number")
                    {
                        string maxsl = DBHelper.getdata("select maxsl from structure_columns_SEQUENCE_fun('" + colinfo.name + "','" + info.name + "','" + DBHelper.CompId() + "','" + DBHelper.UserBranshID("") + "')");
                        if (maxsl == "")
                        {
                            maxsl = "(select isnull(Max(seq2." + colinfo.name + "),0) + 1 from " + info.name + " seq2 where seq2.company_id='" + DBHelper.CompId() + "' )";
                        }
                        columnsIns += maxsl + ",";
                    }
                    else if (colinfo.name.ToLower() == "company_id")
                    {
                        columnsIns += " '" + DBHelper.CompId() + "' as " + colinfo.name + ",";

                    }
                    else if (colinfo.name.ToLower() == "begin_date")
                    {
                        columnsIns += " getdate() as " + colinfo.name + ",";

                    }
                    else
                    {
                        columnsIns += colinfo.name + ",";

                    }
                    string references = "";
                    if (colinfo.isreferences)
                    {
                        references = "'$." + colinfo.name + ".id'";
                    }
                    columnsPar += colinfo.name + " " + colinfo.type + " " + references + ",";
                    if (colinfo.name.ToLower() == "last_update")
                    {
                        updateState += "x." + colinfo.name + "=getdate(),";

                    }
                    else
                    if (colinfo.name.ToLower() != "company_id" && colinfo.name.ToLower() != "begin_date")
                    {
                        updateState += "x." + colinfo.name + "=y." + colinfo.name + ",";

                    }
                }

                if (info.name.ToLower() == "web_news_posts")
                {
                    foreach (var row in info.data)
                    {
                        if (row is JObject jObj)
                        {
                            // التأكد من وجود الخاصية "post_details" وأنها من نوع نصي
                            JToken postDetailsToken = jObj["post_details"];
                            if (postDetailsToken != null && postDetailsToken.Type == JTokenType.String)
                            {
                                string postDetails = postDetailsToken.ToString();
                                try
                                {
                                    string decoded = Hash.base64.Decode(postDetails);
                                    jObj["post_details"] = decoded;
                                }
                                catch (Exception ex)
                                {
                                    // سجل الاستثناء أو اعرض رسالة للمتابعة
                                   // Console.WriteLine("Error decoding post_details: " + ex.Message);
                                }
                            }
                        }
                    }
                }

                string dataJs = JsonConvert.SerializeObject(info.data,
        Formatting.None,
        new JsonSerializerSettings()
        {
            ReferenceLoopHandling = Newtonsoft.Json.ReferenceLoopHandling.Ignore
        });

                columns = columns.TrimEnd(',');
                columnsIns = columnsIns.TrimEnd(',');
                columnsPar = columnsPar.TrimEnd(',');

                updateState = updateState.TrimEnd(',');
                string NewTBdata = "OPENJSON(N'" + dataJs.ToString().Replace("'", "''") + "') with (" + columnsPar + ") as y";

                string insertSQL = "";
                string updateSQL = "";
                string selectSql = "";
                selectSql = "select " + columnsIns + "  from " + NewTBdata + "  " +
                    " where  not exists( select x.ID from " + info.name + " x where x.ID = y.ID)" + Environment.NewLine;
                insertSQL += " insert into " + info.name + " (" + columns + ") " + Environment.NewLine;
                insertSQL += selectSql;

                int countInsertResult = 0;

                string updateResult = "";
                updateSQL = " update x set " + updateState + " from " + info.name + " x join  " + NewTBdata + " on x.ID = y.ID";
                updateResult = DBHelper.Exceutsql_res(updateSQL);
                string insertResult = DBHelper.Exceutsql_res(insertSQL);




                int countUpdateResult = 0;





                try

                {
                    countInsertResult = Convert.ToInt16(insertResult);

                }
                catch (Exception ex)
                {


                }

                try

                {
                    countUpdateResult = Convert.ToInt16(updateResult);

                }
                catch (Exception ex)
                {


                }
                dataResponce dt = new dataResponce();
                dt.insertResult = insertResult;
                dt.updateResult = updateResult;
                dt.countInsertResult = countInsertResult;
                dt.countUpdateResult = countUpdateResult;
                dt.updateSQL = updateSQL;
                dt.insertSQL = insertSQL;


                dtlist.Add(dt);





            }



            dataResult = JsonConvert.SerializeObject(dtlist,
       Formatting.None,
       new JsonSerializerSettings()
       {
           ReferenceLoopHandling = Newtonsoft.Json.ReferenceLoopHandling.Ignore
       });

            return dataResult;
        }
    }



}
