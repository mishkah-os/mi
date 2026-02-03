//## 6/12/2024, 12:46:59 PM - ahmed Khaled - ahmedkasi777@gmail.com ##//
var references_tb = [];

async function getData(key) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("InvoicesDB", 1);

        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(["Invoices"], "readonly");
            const objectStore = transaction.objectStore("Invoices");

            let getRequest;
            if (Number.isInteger(key) && key >= 0) {
                getRequest = objectStore.get(key);
            } else if (key == "lastInvoice") {
                getRequest = objectStore.openCursor(null, "prev");
            } else if (key == "firstInvoice") {
                getRequest = objectStore.openCursor();
            } else {
                getRequest = objectStore.getAll();
            }

            getRequest.onsuccess = function (event) {
                const data = event.target.result;

                if (data) {
                    Number.isInteger(key) || !key
                        ? resolve(data, data.key)
                        : resolve(data.value, data.key);
                } else {
                    swal("الرقم غير موجود");
                }

                db.close();
            };

            getRequest.onerror = function (event) {
                reject(event.target.error);
            };
        };

        request.onerror = function (event) {
            reject(event.target.error);
        };
    });
}


var thdname
function setDefaultDateTimeInputs() {
    const nowDate = new Date().toISOString().split("T")[0];
    const nowDateTime = new Date().toISOString().split(".")[0];

    const dateInputs = document.querySelectorAll('input[type="date"]');
    const dateTimeInputs = document.querySelectorAll(
        'input[type="datetime-local"], input[type="time"]'
    );

    dateInputs.forEach((input) => {
        if (!input.value) {
            input.value = nowDate;
        }
    });
    dateTimeInputs.forEach((input) => {
        if (!input.value) {
            input.value = nowDateTime;
        }
    });
}

function fn_ou_units_sales_installements_get(acID, rowid) {
    getjdata(
        {
            name: "ou_units_sales_installements_get",
            parm: "('" + acID + "','" + Number($("#record_discuss").text()) + "')",
        },
        function (data) {
            if (data.length > 0 && $("#record_discuss").text() != "0") {
                jtot({
                    data: data,
                    id: "unitInstallementsModel",
                    hidecol: "ID,company_id,begin_date",
                });
                $("#unitInstallementsModel thead tr").append(
                    "<th>رقم الإيصال</th><th>قيمة الدفع</th>"
                );
                $("#unitInstallementsModel tbody tr").each((idx, e) => {
                    $(e).append(
                        `<td style='text-align:center;'><input type='text' class='payReceiptNum' style='width: 50px;padding:3px;border-radius: 10px;font-size: 16px;height: fit-content;'><td><input type='number' class='payValue' min='0' style='width: 100px;padding:3px;border-radius: 10px;font-size: 16px;height: fit-content;'></td>`
                    );
                });
                let totPay = 0;
                $("#unitInstallementsModel tbody tr").each((idx, e) => {
                    if (idx < $("#unitInstallementsModel tbody tr").length - 1) {
                        $(e)
                            .find(" .payValue")
                            .val(Number($(e).find(" td:nth-child(6)").text()));
                        totPay += Number($(e).find(" .payValue").val());
                    } else if (idx === $("#unitInstallementsModel tbody tr").length - 1) {
                        $(e)
                            .find(" .payValue")
                            .val(Number($("#record_discuss").text()) - totPay);
                    }
                    $(e)
                        .find("input")
                        .each((x, inpt) => {
                            $(inpt).keypress(function (e2) {
                                if (e2.which == 13) {
                                    let valid = true;
                                    $(e)
                                        .find(" .payValue")
                                        .each((x, inpt) => {
                                            if ($(inpt).val() == "") {
                                                valid = false;
                                                swal("قم بملأ بيانات الدفع");
                                                return;
                                            }
                                        });
                                    $(e)
                                        .find(" .payValue")
                                        .each((x2, inpt2) => {
                                            if (
                                                $(inpt2).val() > Number($("#record_discuss").text()) ||
                                                $(inpt2).val() < 0
                                            ) {
                                                valid = false;
                                                swal("قيمة السند غير كافية");
                                                return;
                                            }
                                            if (
                                                $(inpt2).val() >
                                                Number($(e).find(" td:nth-child(6)").text())
                                            ) {
                                                valid = false;
                                                swal("لا يمكن سداد قيمة اكبر من المتبقي من السند");
                                                return;
                                            }
                                        });
                                    if (valid) {
                                        $.post(
                                            "../../api/v1/data",
                                            {
                                                name: "ou_units_sales_installements_cash_pay",
                                                parameters: JSON.stringify([
                                                    {
                                                        name: "@finance_cash_receivable",
                                                        value: rowid,
                                                        type: "nvarchar",
                                                    },
                                                    {
                                                        name: "@ou_units_sales_installments",
                                                        value: $(e).attr("data-id"),
                                                        type: "nvarchar",
                                                    },
                                                    {
                                                        name: "@receiptNum",
                                                        value: $(e).find(" .payReceiptNum").val(),
                                                        type: "nvarchar",
                                                    },
                                                    {
                                                        name: "@quantity",
                                                        value: $(e).find(" .payValue").val(),
                                                        type: "decimal",
                                                    },
                                                    {
                                                        name: "@paymentDate",
                                                        value: $("#sdate").text(),
                                                        type: "date",
                                                    },
                                                    {
                                                        name: "@compid",
                                                        value: getCookie("CompId"),
                                                        type: "nvarchar",
                                                    },
                                                    {
                                                        name: "@user_insert",
                                                        value: getCookie("UserID"),
                                                        type: "nvarchar",
                                                    },
                                                ]),
                                            },
                                            function (data) {
                                                if (data.length > 0) {
                                                    if (data[0].hasOwnProperty("success")) {
                                                        installementClick(rowValue, accountID, rowID);
                                                        swal("تم الحفظ");
                                                    }
                                                }
                                            }
                                        );
                                    }
                                }
                            });
                        });
                });
            }
        }
    );
}

function fn_ou_units_sales_contract_receivable_cash(id, rowId) {
    getjdata(
        {
            name: "ou_units_sales_contract_receivable_cash",
            parm: "('" + id + "','" + rowId + "')",
        },
        function (data) {
            if (data.length > 0) {
                jtot({
                    data: data,
                    id: "unitCashModel",
                    hidecol: "ID,company_id,begin_date",
                });
                let quanSum = 0;
                $("#unitCashModel tbody tr").each((i, e) => {
                    $(e)
                        .find(" td")
                        .each((idx, e2) => {
                            if (idx == 1) {
                                quanSum += Number($(e2).text());
                            }
                        });
                });
                $("#record_discuss").text(record_value - quanSum);
                if ($("#record_discuss").text() == "0") {
                    $("#unitInstallementsTitle").hide();
                    $("#unitInstallementsModel").html("");
                }
                $("#pays_total").text(quanSum);
                $("#unitInstallementsModel tbody tr").each((idx, e) => {
                    if (idx < $("#unitInstallementsModel tbody tr").length - 1) {
                        totPay += Number($(e).find(" .payValue").val());
                        $(e)
                            .find(" .payValue")
                            .val(Number($(e).find(" td:nth-child(6)").text()));
                    } else if (idx === $("#unitInstallementsModel tbody tr").length - 1) {
                        $(e)
                            .find(" .payValue")
                            .val(Number($("#record_discuss").text()) - totPay);
                    }
                });
            } else {
                $("#unitCashModel").html("");
                $("#record_discuss").text(record_value);
                if ($("#record_discuss").text() == "0") {
                    $("#unitInstallementsTitle").hide();
                    $("#unitInstallementsModel").html("");
                }
                $("#pays_total").text("0");
                $("#unitInstallementsModel tbody tr").each((idx, e) => {
                    if (idx < $("#unitInstallementsModel tbody tr").length - 1) {
                        totPay += Number($(e).find(" .payValue").val());
                        $(e)
                            .find(" .payValue")
                            .val(Number($(e).find(" td:nth-child(6)").text()));
                    } else if (idx === $("#unitInstallementsModel tbody tr").length - 1) {
                        $(e)
                            .find(" .payValue")
                            .val(Number($("#record_discuss").text()) - totPay);
                    }
                });
            }
        }
    );
}

function investmentPay(event, rowID) {
    var valu = $(event.currentTarget).closest("tr").find(".valu").val();
    var profit_value = $(event.currentTarget)
        .closest("tr")
        .find(".profit_value")
        .text(); // استخدم .text() بدلاً من .val() للعنصر غير القابل للتحرير
    var note = $(event.currentTarget).closest("tr").find(".valu1").val();
    if (
        profit_value >= Number(valu) &&
        Number(valu) > 0 &&
        Number(valu) <= Number($("#record_discusss").text())
    ) {
        let paytype = getpar("tbh").toLowerCase().includes("cash")
            ? "cash"
            : "bank";
        $.post(
            "../../erp/procedq",
            {
                id:
                    "investor_" +
                    paytype +
                    "_pay '" +
                    rowID +
                    "','" +
                    $(event.currentTarget).closest("tr").attr("data-id") +
                    "','" +
                    valu +
                    "','" +
                    note +
                    "','" +
                    getCookie("CompId") +
                    "','" +
                    getCookie("UserID") +
                    "'",
            },
            function (data) {
                if (data.length > 0) {
                    if (data[0].hasOwnProperty("success")) {
                        swal("تم الدفع");
                        $(event.currentTarget).closest("tr").hide();
                        $("#record_discusss").text($("#record_discusss").text() - valu);
                        $("#pays_totall").text($("#pays_totall").text() + valu);
                    } else {
                        swal(
                            "خطأ بالدفع اعد تحميل الصفحه! إذا واجهتك نفس المشكله يمكنك التواصل مع الدعم الفني."
                        );
                    }
                }
            }
        );
    } else {
        swal("الرجاء التأكد من القيمة!");
    }
}

function getInvestorPayments(accountID) {
    $.post(
        "../../r/j",
        {
            tb: "car_job_finance_paymanets",
            tbtype: "view",
            parm: "('" + accountID + "','" + getCookie("CompId") + "')",
        },
        function (data) {
            if (data.length > 0) {
                // $("#tbl1").DataTable().destroy();
                var remain = 0;
                $("#tbod1").html("");
                data.forEach((e) => {
                    $("#tbod1").append(`<tr><td>${e.invoice_number}</td>
          <td>${e.invoice_dat?.split("T")[0]}</td>
          <td>${e.amount}</td>
          </tr>`);
                    remain += e.amount;
                });
                var last_value = parseFloat($("#related_value").text()) - remain;
                $("#related_remain").text(last_value);
                if ($("#tbod1").html() == "") {
                    $("#tbod1").html(
                        '<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد مدفوعات!</h5>'
                    );
                }
            } else {
                $("#tbod1").append(`<tr>
                                <td>'<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد مدفوعات!</h5>'</td>
                    </tr>`);
            }
        }
    );
}
function getSalesPayments(accountID) {
    $.post(
        "../../r/j",
        {
            tb: "sales_finance_paymanets_payable",
            tbtype: "view",
            parm: "('" + accountID + "','','" + getCookie("CompId") + "')",
        },
        function (data) {
            if (data.length > 0) {
                // $("#tbl1").DataTable().destroy();
                var remain = 0;
                $("#tbod2").html("");
                data.forEach((e) => {
                    $("#tbod2").append(`<tr><td>${e.invoice_number}</td>
          <td>${e.invoice_date?.split("T")[0]}</td>
          <td>${e.method}</td>
          <td>${e.refunded_amount}</td>
          </tr>`);
                    // < !--remain += e.amount; -->
                });
                // < !-- var last_value = parseFloat($("#related_value").text()) - remain; -->
                //  < !--$("#related_remain").text(last_value); -->
                if ($("#tbod2").html() == "") {
                    $("#tbod2").html(
                        '<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد حركات!</h5>'
                    );
                }
            } else {
                $("#tbod2").append(`<tr>
                                <td>'<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد حركات!</h5>'</td>
                    </tr>`);
            }
        }
    );


    $.post(
        "../../r/j",
        {
            tb: "sales_finance_paymanets_receivable",
            tbtype: "view",
            parm: "('" + accountID + "','','" + getCookie("CompId") + "')",

        },
        function (data) {
            if (data.length > 0) {
                // $("#tbl1").DataTable().destroy();
                var remain = 0;
                $("#tbod1").html("");
                data.forEach((e) => {
                    $("#tbod1").append(`<tr><td>${e.invoice_number}</td>
          <td>${e.invoice_date?.split("T")[0]}</td>
          <td>${e.method}</td>
          <td>${e.amount}</td>
          </tr>`);
                    //   < !--remain += e.amount; -->
                });

                if ($("#tbod1").html() == "") {
                    $("#tbod1").html(
                        '<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد حركات!</h5>'
                    );
                }
            } else {
                $("#tbod1").append(`<tr>
                                <td>'<h5 style="margin=auto;text-align:center;width:100%;">لا يوجد حركات!</h5>'</td>
                    </tr>`);
            }
        }
    );
}

function investmentClick(rowValue, accountID, rowID, accName) {
    $.post(
        "../../r/j",
        {
            tb: "car_jobs_payment",
            tbtype: "view",
            parm: "('" + accountID + "','" + getCookie("CompId") + "')",
        },
        function (data1) {
            if (data1.length > 0) {
                $("#popup2").css("visibility", "visible");
                $("#popup2").css("opacity", "1");
                $("#installementsModel").hide();
                $("#custName").text(accName);
                $("#popup2 #related_value").text(rowValue);

                $.post(
                    "../../r/j",
                    {
                        tb: "finance_payable_sum",
                        tbtype: "view",
                        cols: "sum",
                        parm: "('" + rowID + "')",
                    },
                    function (data) {
                        $("#pays_totall").text(data[0].sum);
                        $("#record_discusss").text(rowValue - data[0].sum);
                    }
                );
                var totalSum;

                $.post(
                    "../../erp/procedq",
                    {
                        id:
                            "car_model_job_inv_watting_complete_finance '" +
                            accountID +
                            "','" +
                            getCookie("CompId") +
                            "'",
                    },
                    function (data) {
                        $("#tbod").html(" ");
                        if (data.length > 0) {
                            data.forEach((e) => {
                                console.log(e.ID);
                                totalSum = eval(
                                    "(" +
                                    e.total_items +
                                    " + " +
                                    e.total_services +
                                    " - " +
                                    e.total_payments +
                                    ")"
                                );

                                $("#tbod").append(
                                    `<tr data-id="${e.ID}"><td>${e.invoice_number}</td><td>${e.eng_chassis_number}</td><td>${e.total_items}</td>
                  <td>${e.total_services}</td>
                  <td>${e.total_payments}</td>
                  <td>${totalSum}</td>
                  
                  <td><input type="number" class="  require" id="value_amount" style="background:#fff;"/></td><tr>`
                                );
                            });
                        }
                        getInvestorPayments(accountID);

                        function get_payment_as_obj(cid) {
                            return {
                                ID: uuidv4(),
                                header_id: cid,
                                job_order_id: rowID,
                                payment_name: "9a05040f43ef4e79b5a1d12178f45ba7",
                                amount: $("#value_amount").val(),
                                payment_date: $("#header_date_hdr").val(),
                                user_insert: getCookie("UserID"),
                            };
                        }
                        $("#payment_info .require").on("keypress", function (e) {
                            if (e.key === "Enter") {
                                if ($("#value_amount").val() !== "") {
                                    if (
                                        parseFloat($("#payment_info #value_amount").val()) <=
                                        parseFloat($("#related_value").text())
                                    ) {
                                        let payment_obj = get_payment_as_obj(
                                            $(e.currentTarget).closest(`tr`).attr("data-id")
                                        );
                                        loading("saving");
                                        $.post(
                                            "../../erp/procedq",
                                            {
                                                id:
                                                    "car_model_job_order_log_save '" +
                                                    JSON.stringify([payment_obj]) +
                                                    "','" +
                                                    getCookie("CompId") +
                                                    "'",
                                            },
                                            function (data) {
                                                console.log(data);
                                                unloading("saving");

                                                if (data.length > 0) {
                                                    if (data[0].hasOwnProperty("error")) {
                                                        swal(`لم يتم الحفظ ${data[0].error}`);
                                                    } else {
                                                        swal("تم الحفظ");
                                                        investmentClick(
                                                            rowValue,
                                                            accountID,
                                                            rowID,
                                                            accName
                                                        );
                                                        // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                        // $("#related_remain").text(last_value)
                                                        // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                    }
                                                } else {
                                                    swal("لم يتم الحفظ");
                                                }
                                            }
                                        );
                                    } else {
                                        swal("قيمة اكبر من المطلوب ");
                                    }
                                } else {
                                    swal("amountnone");
                                }
                            }
                        });
                        // if ($("#tbod").html() == " ") {
                        //   $("#Investors_dataa_payable").hide();
                        // }
                    }
                );
                // getInvestorPayments(accountID, projectId);
            } else {
                swal("هذا الحساب ليس بعميل!");
            }
        }
    );
}

function salesClickpayable(rowValue, accountID, rowID, accName) {
    $.post(
        "../../r/j",
        {
            tb: "finance_sales_payment",
            tbtype: "view",
            parm: "('" + accountID + "','" + getCookie("CompId") + "')",
        },
        function (data1) {
            if (data1.length > 0) {
                $("#popup2").css("visibility", "visible");
                $("#popup2").css("opacity", "1");
                $("#installementsModel").hide();
                $("#custName").text(accName);
                $("#popup2 #related_value").text(rowValue);

                $.post("../../erp/procedq", { id: "finance_payable_sales_sum '" + thdname + "','" + rowID + "','" + getCookie("CompId") + "'" },

                    function (data) {
                        if (data.length > 0) {
                            if (data[0].hasOwnProperty("total_paid")) {
                                $("#pays_total").text(data[0].total_paid);
                                $("#record_discusss").text(rowValue - data[0].total_paid);
                                $("#related_remain").text(rowValue - data[0].total_paid);
                            }
                        }
                    }
                );
                $.post("../../r/j", { tb: "payment_summery_v2", tbtype: "view", cols: "ID,invoice_number,invoice_date,delivery_date,payment_name,sales_order_number,sales_man,totinv,total,total_price,total_discount,receivable,payable,Branch_name,time_x,remain,paynet", parm: "('" + '' + "','" + accountID + "','" + getCookie("CompId") + "')" },


                    function (data) {
                        $("#tbod").html(" ");
                        if (data.length > 0) {
                            let totalSum = 0;
                            data.forEach((e) => {
                                console.log(e.ID);
                                // totalSum = eval(
                                //   "(" +
                                //     e.total_items +
                                //     " + " +
                                //     e.total_services +
                                //     " - " +
                                //     e.total_payments +
                                //     ")"
                                // );
                                totalSum = e.totinv;
                                $("#tbod").append(
                                    `<tr data-id="${e.ID}">
                    <td>${e.invoice_number}</td>
                    <td>${e.invoice_date.split("T")[0]}</td>
                    <td>${e.receivable}</td>
                    <td >${e.payable}</td>
                    <td id="paynet_value">${e.paynet}</td>
                    <td id="remain_value">${e.remain}</td>
                    <td>${e.totinv}</td>
                  
                  <td><input type="number" class=" value_amount  require" id="value_amount" style="background:#fff;"/></td>
                  <td><input type="text" class=" sale_note  require" id="sale_note" style="background:#fff;"/></td>
                  <tr>`
                                );
                            });
                        }
                        getSalesPayments(accountID);

                        $("#payment_info2 .require").on("keypress", function (e) {
                            if (e.key === "Enter") {

                                if ($(this).closest("tr").find("#value_amount").val() !== "") {
                                    if (
                                        parseFloat(
                                            $(this).closest("tr").find("#value_amount").val()
                                        ) <= parseFloat($("#related_value").text())
                                    ) {

                                        loading("saving");
                                        if (thdname == 'Finance_Cash_receivable_details') {


                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_cash_resevable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }
                                        if (thdname == 'Finance_Cash_payable_details') {
                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_cash_payable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }
                                        if (thdname == 'Finance_Bank_payable_details') {

                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_invoice_Bank_payable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }
                                        if (thdname == 'Finance_Bank_receivable_details') {
                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_invoice_bank_receivable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }
                                        if (thdname == 'Finance_Check_Payable_dtl') {

                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_invoice_check_payable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }
                                        if (thdname == 'Finance_Check_Receivable_dtl') {
                                            $.post(
                                                "../../erp/procedq",
                                                {
                                                    id:
                                                        "sales_invoice_check_receivable_save '" +
                                                        $(this).closest("tr").find("#value_amount").val() +
                                                        "',N'" +
                                                        $(this).closest("tr").find("#sale_note").val() +
                                                        "','" +
                                                        rowID +
                                                        "','" +
                                                        $(this).closest("tr").attr("data-id") +
                                                        "','" +
                                                        getCookie("UserID") +
                                                        "','" +
                                                        getCookie("CompId") +
                                                        "'",
                                                },
                                                function (data) {
                                                    console.log(data);
                                                    unloading("saving");

                                                    if (data.length > 0) {
                                                        if (data[0].hasOwnProperty("error")) {
                                                            swal(`لم يتم الحفظ ${data[0].error}`);
                                                        } else {
                                                            swal("تم الحفظ");
                                                            $(this).attr("disabled", "disabled");
                                                            salesClickpayable(rowValue, accountID, rowID, accName);
                                                            // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                            // $("#related_remain").text(last_value)
                                                            // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                        }
                                                    } else {
                                                        swal("لم يتم الحفظ");
                                                    }
                                                }
                                            );

                                        }


                                    } else {
                                        swal("قيمة اكبر من المطلوب ");
                                    }
                                } else {
                                    swal("amountnone");
                                }
                            }
                        });
                        // if ($("#tbod").html() == " ") {
                        //   $("#Investors_dataa_payable").hide();
                        // }
                    }
                );
                // getInvestorPayments(accountID, projectId);
            } else {
                swal("هذا الحساب ليس بعميل!");
            }
        }
    );
}


function salesClick(rowValue, accountID, rowID, accName) {
    $.post(
        "../../r/j",
        {
            tb: "finance_sales_payment",
            tbtype: "view",
            parm: "('" + accountID + "','" + getCookie("CompId") + "')",
        },
        function (data1) {
            if (data1.length > 0) {
                $("#popup2").css("visibility", "visible");
                $("#popup2").css("opacity", "1");
                $("#installementsModel").hide();
                $("#custName").text(accName);
                $("#popup2 #related_value").text(rowValue);

                $.post("../../erp/procedq", { id: "finance_payable_sales_sum '" + thdname + "','" + rowID + "','" + getCookie("CompId") + "'" },
                    function (data) {
                        if (data.length > 0) {
                            if (data[0].hasOwnProperty("total_paid")) {
                                $("#pays_total").text(data[0].total_paid);
                                $("#record_discusss").text(rowValue - data[0].total_paid);
                                $("#related_remain").text(rowValue - data[0].total_paid);
                            }
                        }
                    }
                );


                $.post("../../r/j", { tb: "payment_summery_v2", tbtype: "view", cols: "ID,invoice_number,invoice_date,delivery_date,payment_name,sales_order_number,sales_man,totinv,total,total_price,total_discount,receivable,pabpayableable,Branch_name,time_x,remain,paynet", parm: "('" + '' + "','" + accountID + "','" + getCookie("CompId") + "')" },

                    function (data) {
                        $("#tbod").html(" ");
                        if (data.length > 0) {
                            let totalSum = 0;
                            data.forEach((e) => {
                                console.log(e.ID);
                                // totalSum = eval(
                                //   "(" +
                                //     e.total_items +
                                //     " + " +
                                //     e.total_services +
                                //     " - " +
                                //     e.total_payments +
                                //     ")"
                                // );
                                totalSum = e.totinv;
                                $("#tbod").append(
                                    `<tr data-id="${e.ID}">
                  <td>${e.invoice_number}</td>
                  <td>${e.invoice_date.split("T")[0]}</td>
                  <td>${e.receivable}</td>
                  <td>${e.payable}</td>
                  <td>${e.paynet}</td>
                  <td>${e.remain}</td>
                  <td>${e.totinv}</td>
                
                  
                  <td><input type="number" class="  require" id="value_amount" style="background:#fff;"/></td>
                  <td><input type="text" class="  require" id="sale_note" style="background:#fff;"/></td>
                  <tr>`
                                );
                            });
                        }
                        getSalesPayments(accountID);

                        $("#payment_info2 .require").on("keypress", function (e) {
                            if (e.key === "Enter") {
                                if ($("#value_amount").val() !== "") {
                                    if (
                                        parseFloat(
                                            $(this).closest("tr").find("#value_amount").val()
                                        ) <= parseFloat($("#related_value").text())
                                    ) {
                                        $(this).attr("disabled", "disabled");
                                        loading("saving");
                                        $.post(
                                            "../../erp/procedq",
                                            {
                                                id:
                                                    "sales_cash_resevable_save '" +
                                                    $(this).closest("tr").find("#value_amount").val() +
                                                    "',N'" +
                                                    $(this).closest("tr").find("#sale_note").val() +
                                                    "','" +
                                                    rowID +
                                                    "','" +
                                                    $(this).closest("tr").attr("data-id") +
                                                    "','" +
                                                    getCookie("UserID") +
                                                    "','" +
                                                    getCookie("CompId") +
                                                    "'",
                                            },
                                            function (data) {
                                                console.log(data);
                                                unloading("saving");

                                                if (data.length > 0) {
                                                    if (data[0].hasOwnProperty("error")) {
                                                        swal(`لم يتم الحفظ ${data[0].error}`);
                                                    } else {
                                                        swal("تم الحفظ");
                                                        salesClick(rowValue, accountID, rowID, accName);
                                                        // var last_value = totalSum - parseFloat($("#payment_info #value_amount").val())
                                                        // $("#related_remain").text(last_value)
                                                        // console.log(last_value, "jjjjjjjjjjjjjjjjjjjjjj")
                                                    }
                                                } else {
                                                    swal("لم يتم الحفظ");
                                                }
                                            }
                                        );
                                    } else {
                                        swal("قيمة اكبر من المطلوب ");
                                    }
                                } else {
                                    swal("amountnone");
                                }
                            }
                        });
                        // if ($("#tbod").html() == " ") {
                        //   $("#Investors_dataa_payable").hide();
                        // }
                    }
                );
                // getInvestorPayments(accountID, projectId);
            } else {
                swal("هذا الحساب ليس بعميل!");
            }
        }
    );
}

function installementClick(totIdTR, servIdTR, rowIdTR) {
    $("#popup1").css("visibility", "visible");
    $("#popup1").css("opacity", "1");
    $("#reservModelBody").hide();
    let record_value = Number(totIdTR);
    $("#record_value").text(record_value);
    let quanSum = 0;
    $("#unitCashModel tbody tr").each((i, e) => {
        $(e)
            .find(" td")
            .each((idx, e2) => {
                if (idx == 1) {
                    quanSum += Number($(e2).text());
                }
            });
    });
    $("#record_discuss").text(record_value - quanSum);
    if ($("#record_discuss").text() == "0") {
        $("#unitInstallementsTitle").hide();
        $("#unitInstallementsModel").html("");
    }
    $("#pays_total").text(quanSum);
    getjdata(
        {
            name: "ou_units_show",
            parm: "('" + servIdTR + "')",
        },
        function (data) {
            if (data.length > 0) {
                jtot({
                    data: data,
                    id: "installementsModelBody",
                    hidecol: "ID,company_id,begin_date",
                });
                $("#installementsModelBody thead tr").prepend("<th>*</th>");
                $("#installementsModelBody tbody tr").each((idx, e2) => {
                    $(e2).prepend(`<td><input type='radio' class='checkUnit'></td>`);
                    if (idx == 0) {
                        $(".checkUnit").attr("checked", true);
                        fn_ou_units_sales_installements_get(servIdTR, rowIdTR);
                        fn_ou_units_sales_contract_receivable_cash(
                            $(e2).attr("data-id"),
                            rowIdTR
                        );
                    }
                });
                $(".checkUnit")
                    .off("click")
                    .on("click", (e2) => {
                        if (e2.currentTarget.checked) {
                            fn_ou_units_sales_installements_get(servIdTR, rowIdTR);
                            fn_ou_units_sales_contract_receivable_cash(
                                $(e2.currentTarget).closest("tr").attr("data-id"),
                                rowIdTR
                            );
                        }
                    });
            }
        }
    );
}

function ou_units_Reservations_resr(customer_id, record_id, record_value) {
    loading("ou_units_customer_Reservations_load");
    $.post(
        "../../r/j",
        {
            tb: "ou_units_customer_Reservations_fin",
            tbtype: "view",
            parm: "('" + customer_id + "','" + getCookie("CompId") + "')",
        },
        function (data) {
            unloading("ou_units_customer_Reservations_load");
            $("#invoices").empty();
            if (data.length > 0) {
                data = data.sort((a, b) => {
                    if (Number(a.code) < Number(b.code)) {
                        return -1;
                    }
                });
                let html = `<table class="table no-border" id="invoice_table" >
                                <h1 class="h4 text-white">حجوزات غير مكتملة الدفع </h1>
                                <tbody>
                                    <tr>

                                        <th  > رقم الحجز</th>
                                        <th  > تاريخ الحجز</th>
                                        <th  > Check in </th>
                                        <th  > Check out </th>
                                        <th  >قيمة الحجز</th>
                                        <th  >المتبقي</th>
                                        <th  >  الحالة</th>
                                        <th  class="value_h">  القيمة</th>
                                        <th  class="notes_h">  ملاحظات</th>
                                        <th  ></th>
                                    </tr>`;
                data.forEach((e) => {
                    html += `<tr>
                                <td >${e.code}</td>
                                <td >${e.begin_date.split("T")[0]}</td>
                                <td >${e.Check_in_date.split("T")[0]}</td>
                                <td >${e.Check_out_date.split("T")[0]}</td>
                                <td >${e.total}</td>
                                <td >${e.remain}</td>
                                <td >${e.Reservation_status_name}</td>
                                <td>
                                  <input
                                    type="number"
                                    min="1"
                                    data-code="${e.code}" data-id="${e.ID
                        }"  class=" require input value"
                                  />
                                </td>
                                <td>
                                  <textarea class="notes" rows="1" cols="15">

                                  </textarea>
                                </td>
                            </tr>`;
                });
                html += `</tbody>
                    </table>`;

                $("#cust_name").text(data[0].Customer_name);
                $("#cust_number").text(data[0].phone_number);
                $("#invoices").append(html);
                // $('.value').hide();
                //     $('.value_h').hide();
                //     $('.notes').hide();
                //     $('.notes_h').hide();
                $("#popup1 #invoices tbody")
                    .get(0)
                    .scrollIntoView({ behavior: "smooth" });
                $(".value").off("mousedown");
                $(".value").on("mousedown", function () {
                    // $('.value').hide();
                    //   $('.value_h').hide();
                    //   $('.notes').hide();
                    //   $('.notes_h').hide();
                    $("#popup1 #resvation_number").attr(
                        "data-id",
                        $(this).attr("data-id")
                    );
                    $("#popup1 #resvation_number").val($(this).attr("data-code"));
                    // $(this).closest('tr').find('.value').show();
                    // $('.value_h').show();
                    // $(this).closest('tr').find('.notes').show();
                    // $('.notes_h').show();
                    if ($(this).attr("data-old_val") != $(this).val()) {
                        ou_units_reservation_summary($(this).attr("data-id"), $(this));
                    }
                });
                $("#popup1 #invoices tbody tr td .value").off("keypress");
                $("#popup1 #invoices tbody tr td .value").on("keypress", function (e) {
                    if (e.key === "Enter") {
                        $(this).attr("disabled", "disabled");
                        var val = Number($(this).val());

                        var notes = $(this).closest("tr").find(".notes").val();
                        if (val > 0) {
                            if (val > Number($("#popup1 #remain").val())) {
                                swal(`لايمكن الدفع أكثر من متبقي الفاتورة`);
                                $(this).removeAttr("disabled");
                            } else {
                                if (val > record_value) {
                                    $(this).removeAttr("disabled");
                                    swal(
                                        `لم يتم الحفظ لايمكن الدفع أكثر من قيمة الحد الاقصي للدفع علي البند هو ${record_value}`
                                    );
                                } else {
                                    $.post(
                                        "../../erp/procedq",
                                        {
                                            id:
                                                "sales_cash_resevable_save '" +
                                                val +
                                                "',N'" +
                                                notes +
                                                "','" +
                                                record_value +
                                                "','" +
                                                record_id +
                                                "','" +
                                                $("#popup1 #resvation_number").attr("data-id") +
                                                "','" +
                                                getCookie("UserID") +
                                                "','" +
                                                getCookie("CompId") +
                                                "'",
                                        },
                                        function (data) {
                                            if (data.length > 0) {
                                                if (data[0].hasOwnProperty("ID")) {
                                                    $("#popup1 #payment").val(
                                                        Number($("#popup1 #payment").val()) + val
                                                    );
                                                    $("#popup1 #remain").val(
                                                        Number($("#popup1 #remain").val()) - val
                                                    );
                                                    $(this)
                                                        .closest("tr")
                                                        .find(".remain")
                                                        .text($("#popup1 #remain").val());
                                                    swal("تم الحفظ");
                                                    record_value = record_value - val;
                                                    $("#record_discuss").text(record_value);
                                                    $("#pays_total").text(
                                                        Number($("#pays_total").html()) + val
                                                    );
                                                    // $(this).closest('tr').find('.value').hide();
                                                    // $(this).closest('tr').find('.value').val(0);
                                                    // $('.value_h').hide();
                                                    // $(this).closest('tr').find('.notes').hide('');
                                                    // $(this).closest('tr').find('.notes').val('');
                                                    // $('.notes_h').hide();
                                                    ou_units_Reservations_resr(
                                                        cust_id,
                                                        record_id,
                                                        record_value
                                                    );
                                                    record_payments();
                                                } else {
                                                    $(this).removeAttr("disabled");
                                                    try {
                                                        swal(`لم يتم الحفظ ${data[0].error}`);
                                                    } catch (ex) {
                                                        swal(`لم يتم الحفظ `);
                                                    }
                                                }
                                            } else {
                                                $(this).removeAttr("disabled");
                                                swal(`لم يتم الحفظ `);
                                            }
                                        }
                                    );
                                }
                            }
                            $("#popup1 #value").val(0);
                        } else {
                            $(this).removeAttr("disabled");
                            swal(`يجب ان تكون القيمة أكبر من صفر`);
                        }
                    }
                });
                // $("#ou_units_Reservations_finance_advanced_search").val("");
            } else {
                $("#invoices").empty();
                $("#invoices").append(`<h4 class="h4">لا يوجد أمر حجز</h4>`);
            }
        }
    );
}
function record_payments(record_id, record_value) {
    loading("ou_units_reservation_cash_resevable_get_load");
    $.post(
        "../../r/j",
        {
            tb: "ou_units_reservation_cash_resevable_get",
            tbtype: "view",
            parm: "('" + record_id + "','" + getCookie("CompId") + "')",
        },
        function (data) {
            unloading("ou_units_reservation_cash_resevable_get_load");
            $("#popup1 #payments_div").empty();
            let html = "";
            if (data.length > 0) {
                html = `<table class="table no-border" id="payments_table" >
                                <tbody>
                                    <tr>
                                        <th  ></th>
                                        <th  > رقم الحجز</th>
                                        <th  >Check in</th>
                                        <th  >Check out</th>
                                        <th  >القيمة</th>
                                        <th  >  ملاحظات</th>
                                        <th  >  التاريخ</th>
                                        <th  >  اسم الموظف</th>

                                    </tr>`;
                data.forEach((e) => {
                    html += `
                            <tr>
                              <td class="btns"><a data-code="${e.code
                        }" data-id="${e.ID
                        }"  class="btn btn-danger payed_del" data-val="${e.amount
                        }" data-id="${e.ID
                        }" style="cursor:pointer;padding:0"><span class="material-symbols-outlined" style="
                                    font-size: 30px;
                                    padding: 0;
                                     margin: 0;
                                    ">
                                        delete
                                    </span></a>

                                </td>
                                <td>${e.code}
                                </td>
                                <td>${e.Check_in_date.split("T")[0]}
                                </td>
                                <td>${e.Check_out_date.split("T")[0]}
                                </td>
                                <td>${e.amount}
                                </td>
                                <td >
                                    ${e.notes}
                                </td>
                                <td>${e.dateC.split("T")[0]}
                                </td>
                                <td >
                                    ${e.employee}
                                </td>
                            </tr>`;
                });
                html += `<tbody></table>`;
            }
            $("#popup1 #payments_div").append(html);
            $(".payed_del").off("click");
            $(".payed_del").on("click", function () {
                var ths = $(this);
                swal(
                    {
                        title: "هل أنت متأكد أنك تريد الحذف     ",
                        text: "في حال تأكيد  الحذف  لا يمكنك  التراجع عنه ",
                        type: "warning",
                        showDenyButton: true,
                        showCancelButton: false,
                        confirmButtonText: "نعم قم  بالحذف  نهائياً",
                        denyButtonText: `لا تقم بالحذف `,
                    },
                    function () {
                        $.post(
                            "../../erp/procedq",
                            {
                                id:
                                    "ou_units_reservation_cash_resevable_del '" +
                                    ths.attr("data-id") +
                                    "','" +
                                    getCookie("CompId") +
                                    "'",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].hasOwnProperty("success")) {
                                        swal("تم الحذف");
                                        record_value = record_value + Number(ths.attr("data-val"));
                                        ths.closest("tr").remove();
                                        $("#record_discuss").text(record_value);
                                        $("#pays_total").text(
                                            Number($("#pays_total").html()) +
                                            Number(ths.attr("data-val"))
                                        );
                                        ou_units_Reservations_resr(
                                            cust_id,
                                            record_id,
                                            record_value
                                        );
                                        record_payments();
                                    } else {
                                        try {
                                            swal(` لم يتم الحذف ${data[0].error}`);
                                        } catch (ex) {
                                            swal(` لم يتم الحذف `);
                                        }
                                    }
                                } else {
                                    swal(` لم يتم الحذف `);
                                }
                            }
                        );
                    }
                );
            });
        }
    );
}

function buildContextMenu(table) {
    let contextHtml = `<div id="${table}_contextDiv">
  
  
  <ul id="${table}_contextMenu" class='contextMenu'></ul>
  
  <div class="modal fade" id="${table}_detailsPage" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1"
       aria-labelledby="staticBackdropLabel" aria-hidden="true" style='z-index:9999999;'>
      <div class="modal-dialog" style='max-width: 1120px;margin-inline-start: 282px;'>
          <div class="modal-content secondPagee dark-version">
              <div class="modal-header">
                  <h4 id='${table}_dtlTitle' class='mtitle' style='text-align: center;inset-inline-start: 30px;'></h4>
                  <span class='btn btn-outline-danger' data-bs-dismiss="modal" aria-label="Close">x</span>
              </div>
              <div class="modal-body"  ></div>
              <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
          </div>
      </div>
  </div></div>`;
    if ($("#" + table + "_contextMenu").length == 0) {
        $("#" + table).append(contextHtml);
    }
    $(`#${table} tbody tr:not([style*="display: none;"])`)
        .off("contextmenu")
        .on("contextmenu", (ec) => {
            ec.preventDefault();
            $("#" + table + "_contextMenu").html("");

            $("#" + table + "_contextMenu").css({
                display: "block",
                top: ec.pageY,
                left:
                    getCookie("UserLang") == "ar"
                        ? ec.pageX - $("#" + table + "_contextMenu").width()
                        : ec.pageX - 270,
            });
            $("#" + table + "_contextMenu").append(
                `<li id='related_print'>طباعه</li><li id='related_advanced'>عرض متقدم</li><li id='related_delete'>حذف</li>`
            );
            $("#related_print")
                .off("click")
                .on("click", () => {
                    let titlee = "إيصال استلام نقدية";
                    let namee = "print_vau_in";
                    if (getpar("tbh").toLowerCase() == "finance_cash_payable_header") {
                        titlee = "إيصال صرف نقدية";
                        namee = "print_vau_out";
                    } else if (
                        getpar("tbh").toLowerCase() == "finance_bank_receivable_header"
                    ) {
                        titlee = "إيصال قبض بنكي";
                    } else if (
                        getpar("tbh").toLowerCase() == "finance_bank_payable_header"
                    ) {
                        titlee = "إيصال صرف بنكي";
                        namee = "print_vau_out";
                    }
                    window.open(
                        `../../billapi/${namee}?id=${$(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val()}&tbh=${getpar("tbh")}&tbd=${table}&title=${titlee}`,
                        "_blank"
                    );
                });
            $("#related_advanced")
                .off("click")
                .on("click", () => {
                    window.open(
                        `../../ERP/tablet?tbname=${table}&xxx=${$(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val()}&colx=ID&hidefrm=true`,
                        "_blank"
                    );
                });
            $("#related_delete")
                .off("click")
                .on("click", (i) => {
                    if (
                        !getCookie("usersgroups").split(",").includes("administrators") &&
                        new Date(document.getElementById("header_date_hdr").value) <
                        new Date(2023, 6, 30) &&
                        window.location.host.toLowerCase() == "elkawmiah.mas.com.eg"
                    ) {
                        swal("ليس لديك صلاحية!");
                    } else {
                        $(i.target).closest("tr").hide();
                        $(i.target).closest("tr").find(" td#isdelete input").val("true");
                        SubTableFunctionalities(table);
                        let sumTlt = 0;
                        $(`#${table} tbody tr:not([style*="display: none;"])`).each(
                            (idx, tr) => {
                                sumTlt += Number($(tr).find(" td:last").text());
                            }
                        );
                        $(`#${table}_totalFunction`).text(sumTlt.toFixed(2));
                        $(`#${table} tfoot tr:nth-child(2) #sr`).val(
                            Number(
                                $('input[data-colname="sr"]:eq(-2)').length > 0
                                    ? $('input[data-colname="sr"]:eq(-2)').val()
                                    : 0
                            ) + 1
                        );
                    }

                    $(ec.currentTarget).closest("tr").remove();
                    $("#" + table + "_contextMenu").css({ display: "none" });
                    SubTableFunctionalities(table);
                    let sumTlt = 0;
                    $(`#${table} tbody tr:not([style*="display: none;"])`).each(
                        (idx, tr) => {
                            sumTlt += Number($(tr).find(" td:last").text());
                        }
                    );

                    $(`#${table}_totalFunction`).text(sumTlt.toFixed(2));
                });




            if (
                getpar("tbh").toLowerCase() == "finance_cash_receivable_header" ||
                getpar("tbh").toLowerCase() == "finance_bank_receivable_header" || getpar("tbh").toLowerCase() == "finance_cash_payable_header" || getpar("tbh").toLowerCase() == "finance_bank_payable_header"
            ) {
                $("#" + table + "_contextMenu").prepend(
                    `<li id='related_sales'> المبيعات</li><li id='related_reservartion'>مدفوعات الحجوزات</li><li id='related_installements'>مدفوعات الإقساط</li><li id='related_jobOrder'>مدفوعات أوامر الشغل</li>`
                );
                $("#related_sales")
                    .off("click")
                    .on("click", (e) => {
                        let value = $(ec.currentTarget)
                            .closest("tr")
                            .find("#trans_value input")
                            .val();
                        let account_id = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .attr("data-id");
                        let accName = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .val();
                        let rowID = $(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val();

                        salesClickpayable(value, account_id, rowID, accName);
                        //  < !--salesClick(value, account_id, rowID, accName); -->
                    });
                $("#related_jobOrder")
                    .off("click")
                    .on("click", (e) => {
                        let value = $(ec.currentTarget)
                            .closest("tr")
                            .find("#trans_value input")
                            .val();
                        let account_id = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .attr("data-id");
                        let accName = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .val();
                        let rowID = $(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val();
                        investmentClick(value, account_id, rowID, accName);
                    });
                $("#related_installements")
                    .off("click")
                    .on("click", (e) => {
                        let totIdTR = $(ec.currentTarget)
                            .closest("tr")
                            .find("#trans_value input")
                            .val();
                        let servIdTR = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .val();
                        let rowIdTR = $(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val();
                        installementClick(totIdTR, servIdTR, rowIdTR);
                    });
                $("#related_reservartion")
                    .off("click")
                    .on("click", function (e) {
                        $("#popup1").css("visibility", "visible");
                        $("#popup1").css("opacity", "1");
                        $("#installementsModel").hide();
                        let record_id = $(ec.currentTarget)
                            .closest("tr")
                            .find("#id input")
                            .val();
                        let cust_id = $(ec.currentTarget)
                            .closest("tr")
                            .find("#account_code :input")
                            .filter("select, input")
                            .attr("data-id");
                        console.log(
                            "lss",
                            cust_id,
                            $(ec.currentTarget).closest("tr"),
                            $(ec.currentTarget)
                                .closest("tr")
                                .find("#account_code :input")
                                .filter("select, input")
                        );
                        let record_value = Number(
                            $(ec.currentTarget).closest("tr").find("#trans_value input").val()
                        );
                        $("#record_value").text(record_value);
                        $("#record_discuss").text(record_value);
                        loading(
                            "ou_units_reservation_cash_resevable_get_all_tranaction_load"
                        );
                        $.post(
                            "../../erp/procedq",
                            {
                                id:
                                    "ou_units_reservation_bank_resevable_trans 'ou_units_reservation_cash_receivable','cash_detail_id','" +
                                    record_id +
                                    "','" +
                                    getCookie("CompId") +
                                    "'",
                            },
                            function (data) {
                                unloading(
                                    "ou_units_reservation_cash_resevable_get_all_tranaction_load"
                                );
                                if (data.length > 0) {
                                    if (data[0].hasOwnProperty("total_paid")) {
                                        $("#pays_total").text(data[0].total_paid);
                                        record_value = record_value - data[0].total_paid;
                                        $("#record_discuss").text(record_value);
                                    }
                                }
                            }
                        );
                        ou_units_Reservations_resr(cust_id, record_id, record_value);
                        record_payments(record_id, record_value);
                    });
            }
        });

    document.addEventListener("click", (event) => {
        if (
            !document.getElementById(table + "_contextMenu")?.contains(event.target)
        ) {
            $("#" + table + "_contextMenu").css({ display: "none" });
        }
    });
}

function autocomplete(inptId, suggestions) {
    $("html").append(`<style>
        .autocomplete-active {
          background:#607D8B;
        }
      </style>`);
    let currentFocus,
        dropdown,
        inputElement = document.querySelector(`input#${inptId}`);
    if (!inputElement.parentNode.querySelector("ul")) {
        dropdown = document.createElement("ul");
        dropdown.classList.add("autocomplete-dropdown" + inptId);
    } else {
        dropdown = inputElement.parentNode.querySelector("ul");
    }
    dropdown.style = ``;
    dropdown.style.display = "none";

    inputElement.parentNode.insertBefore(dropdown, inputElement);

    inputElement.addEventListener("keyup", function () {
        const inputValue = this.value;
        closeDropdown();

        if (!inputValue) {
            if (inptId.toLowerCase() == "account_treef") {
                $(inputElement).attr("data-id", "");
                return;
            }
            return;
        }
        if (inputValue.trim() == "") {
            if (inptId.toLowerCase() == "account_treef") {
                $(inputElement).attr("data-id", "");
            }
        }

        const memoizeFilter = (function () {
            const memo = new Map();
            function simpleArabicChar(word) {
                word = word?.split("أ").join("ا");
                word = word?.split("ة").join("ه");
                word = word?.split("ى").join("ي");
                word = word?.split("ؤ").join("و");
                word = word?.split("آ").join("ا");
                word = word?.split("ئ").join("ء");
                word = word?.split("إ").join("ا");
                return word;
            }
            return function (input, suggestions) {
                const key = input + JSON.stringify(suggestions);
                if (memo.has(key)) {
                    return memo.get(key);
                }
                const lowerInput = input.toLowerCase();
                const filtered = suggestions
                    .filter((suggestion) =>
                        suggestion?.values.some((v) => {
                            // v?.toLowerCase().includes(inputValue.toLowerCase())
                            let sug = simpleArabicChar(v?.toLowerCase());
                            let searchString = simpleArabicChar(inputValue?.toLowerCase());

                            let isSearch = true;
                            searchString.split(" ").map((word) => {
                                if (!sug?.includes(word.toLowerCase())) {
                                    isSearch = false;
                                }
                            });
                            return isSearch;
                        })
                    )
                    .slice(0, 200);
                console.log("filtered", filtered);
                memo.set(key, filtered);
                return filtered;
            };
        })();

        const filteredSuggestions = memoizeFilter(inputValue, suggestions);

        if (filteredSuggestions.length === 0) {
            return;
        }
        filteredSuggestions.slice(0, 200).forEach(function (suggestion) {
            const suggestionElement = document.createElement("li");
            suggestion.values?.forEach((v) => {
                suggestionElement.innerHTML += "<strong>" + v + "</strong> | ";
            });
            $(suggestionElement).attr("data-id", suggestion.ID);
            $(suggestionElement).attr("data-code", suggestion.values[2]);
            $(suggestionElement).attr("data-tree", suggestion.values[1]);

            suggestionElement.addEventListener("click", function () {
                inputElement.value = suggestion.values[0];
                $(inputElement).attr("data-id", suggestion.ID);
                $(inputElement).attr("data-code", suggestion.values[2]);
                $(inputElement).attr("data-tree", suggestion.values[1]);
                $(inputElement).attr("value", suggestion.ID);
                if (
                    $(inputElement).attr("data-colname").toLowerCase() == "account_code"
                ) {
                    $(inputElement)
                        .closest("tr")
                        .find("#account_oldCode span")
                        .text(suggestion.values[2]);
                    $(inputElement)
                        .closest("tr")
                        .find("input[data-colname='Tree_id']")
                        .val(suggestion.values[1]);
                }
                closeDropdown();
            });
            dropdown.appendChild(suggestionElement);
            $(".autocomplete-dropdown" + inptId + " li").attr(
                "style",
                "padding: 6px 5px 6px 20px;cursor:pointer;width: max-content;transition:.3s;border-bottom: 1px solid rgb(63 63 63 / 21%);"
            );
            $(".autocomplete-dropdown" + inptId + " li").hover(function (e) {
                $(this).css(
                    "background-color",
                    e.type === "mouseenter" ? "#607D8B" : "transparent"
                );
            });
        });

        dropdown.style.display = "block";
    });

    // Event listener for keyboard navigation
    inputElement.addEventListener("keydown", function (event) {
        const suggestionElements = dropdown.getElementsByTagName("li");
        if (event.keyCode === 40) {
            // Arrow down key
            currentFocus =
                currentFocus === undefined
                    ? 0
                    : (currentFocus + 1) % suggestionElements.length;
            setActiveSuggestion(suggestionElements, currentFocus);
        } else if (event.keyCode === 38) {
            // Arrow up key
            currentFocus =
                currentFocus === undefined
                    ? suggestionElements.length - 1
                    : (currentFocus - 1 + suggestionElements.length) %
                    suggestionElements.length;
            setActiveSuggestion(suggestionElements, currentFocus);
        } else if (event.keyCode === 13) {
            // Enter key
            event.preventDefault();
            if (currentFocus !== undefined) {
                inputElement.value = suggestionElements[currentFocus].textContent;
                $(inputElement).attr(
                    "data-id",
                    $(suggestionElements[currentFocus]).attr("data-id")
                );
                $(inputElement).attr(
                    "data-code",
                    $(suggestionElements[currentFocus]).attr("data-code")
                );
                $(inputElement).attr(
                    "data-tree",
                    $(suggestionElements[currentFocus]).attr("data-tree")
                );
                $(inputElement).attr(
                    "value",
                    $(suggestionElements[currentFocus]).attr("data-id")
                );
                closeDropdown();
            }
        }
    });

    function closeDropdown() {
        dropdown.innerHTML = "";
        dropdown.style.display = "none";
        currentFocus = undefined;
    }

    function setActiveSuggestion(suggestionElements, index) {
        for (let i = 0; i < suggestionElements.length; i++) {
            suggestionElements[i].classList.remove("autocomplete-active");
        }
        suggestionElements[index]?.classList.add("autocomplete-active");
    }

    document.addEventListener("click", function (event) {
        if (event.target !== inputElement && event.target !== dropdown) {
            closeDropdown();
        }
    });

    $(".autocomplete-dropdown" + inptId).attr(
        "style",
        `background:rgb(0 122 111);;color: white;padding:0;list-style:inside;border-radius: 5px;position: absolute;top:100%;right:0px;overflow: scroll;max-height: 200px;z-index: 100000;font-size:13px; max-width:500px;`
    );
}

function save_editDoc() {
    loading("Save_EditDOC");
    let colsData = [];
    document.querySelectorAll("#inputsContainer tbody tr").forEach((i, idx) => {
        let name = $(i).attr("id");
        let obj = {
            id: $(i).attr("id"),
            name: $(i).find(`#${name}_name`).val(),
            is_show: $(i).find(`#${name}_show`).is(":checked"),
            readonly: $(i).find(`#${name}_readonly`).is(":checked"),
            column_width: Number($(i).find(`#${name}_width`).val()),
            sort: Number($(i).find(`#${name}_sort`).val()),
            reference_inpt: $(i).find(`#${name}_reference option:selected`).val()
                ? $(i).find(`#${name}_reference option:selected`).val()
                : "",
        };
        colsData.push(obj);
    });

    if ($("input[name='editSave']:checked").val() == "company") {
        $.post(
            "../../erp/procedq",
            {
                id:
                    "structure_company_info_save N'" +
                    $("#docTitle_inpt").val() +
                    "',N'" +
                    JSON.stringify(colsData) +
                    "','" +
                    $("#docTitle_inpt").data("tablename") +
                    "','" +
                    getCookie("CompId") +
                    "'",
            },
            function (data) {
                unloading("Save_EditDOC");
                if (data[0].success == "success") {
                    location.reload();
                    swal("تم الحفظ");
                }
            }
        );
    } else {
        $.post(
            "../../erp/procedq",
            {
                id:
                    "structure_info_save N'" +
                    $("#docTitle_inpt").val() +
                    "',N'" +
                    JSON.stringify(colsData) +
                    "','" +
                    $("#docTitle_inpt").data("tablename") +
                    "'",
            },
            function (data) {
                unloading("Save_EditDOC");
                if ((data[0].success = "success")) {
                    location.reload();
                    swal("تم الحفظ");
                }
            }
        );
    }
}
function saveInvoice() {
    const invoice = [];
    let valid = true;
    let message = "";

    document.querySelectorAll("section").forEach((section) => {
        if (
            $(section).find("table").length > 0 ||
            $(section).find("tableid").length > 0
        ) {
            const sectionObject = {
                name: section.id,
                data: [],
                columns: [],
            };
            const rows = section.querySelectorAll("tbody tr");

            rows.forEach((row) => {
                sectionObject.columns = [];
                const cells =
                    $(`#${section.id}_totalFunction`).length > 0
                        ? row.querySelectorAll("td:not(:last-child)")
                        : row.querySelectorAll("td");
                const rowobject = {};

                cells.forEach((cell) => {
                    if (!cell.classList.contains("nodata")) {
                        const element = cell.querySelector("input, select");
                        if (element) {
                            if (element.hasAttribute("data-id")) {
                                rowobject[cell.className] = {
                                    id: element.getAttribute("data-id"),
                                    value: element.value,
                                };
                                sectionObject.columns.push({
                                    name: cell.className,
                                    type: "NVARCHAR(60)",
                                    isreferences: true,
                                });
                            } else if (element.tagName === "SELECT") {
                                rowobject[cell.className] = {
                                    id: element.value,
                                    value: $(`#select2-${element.id}-container`).text(),
                                };
                                sectionObject.columns.push({
                                    name: cell.className,
                                    type: "NVARCHAR(60)",
                                    isreferences: true,
                                });
                            } else {
                                let elVal;
                                if (element.value == "on") {
                                    elVal = true;
                                } else if (
                                    cell.getAttribute("data-type").includes("numeric") ||
                                    cell.getAttribute("data-type").includes("decimal")
                                ) {
                                    elVal = Number(element.value);
                                } else if (
                                    (element.getAttribute("type") == "datetime" ||
                                        element.getAttribute("type") == "datetime-local") &&
                                    $('input[name="status"]:checked').val() != "offline"
                                ) {
                                    elVal = new Date(element.value);
                                } else if (
                                    cell.getAttribute("data-type").includes("nvarchar")
                                ) {
                                    elVal = element.value;
                                } else {
                                    elVal = element.value;
                                }
                                rowobject[cell.className] = elVal;
                                sectionObject.columns.push({
                                    name: cell.className,
                                    type: cell.getAttribute("data-type"),
                                    isreferences: false,
                                });
                            }
                        } else {
                            if (cell.hasAttribute("data-id")) {
                                rowobject[cell.className] = {
                                    id: cell.getAttribute("data-id"),
                                    value: cell.textContent,
                                };
                                sectionObject.columns.push({
                                    name: cell.className,
                                    type: "NVARCHAR(60)",
                                    isreferences: true,
                                });
                            }
                        }
                    }
                });
                sectionObject.data.push(rowobject);
            });
            invoice.push(sectionObject);
        } else {
            const elements = section.querySelectorAll("input, select");
            const sectionObject = {
                name: section.id,
                data: [{}],
                columns: [],
            };
            elements.forEach((element, idx) => {
                const isNullable = element.getAttribute("is_nullable") != "false";
                const elementId = element.id.replace(/_hdr/g, "");
                let elementValue = element.value;
                if (
                    !isNullable &&
                    (!elementValue || elementValue == "" || elementValue == "default")
                ) {
                    valid = false;
                    message = elementId;
                }
                if (element.hasAttribute("data-id")) {
                    sectionObject.data[0][elementId] = {
                        id: element.getAttribute("data-id"),
                        value: elementValue,
                    };
                    sectionObject.columns.push({
                        name: elementId,
                        type: "NVARCHAR(60)",
                        isreferences: true,
                    });
                } else if (element.tagName === "SELECT") {
                    if (elementValue.toLowerCase() == "default") {
                        sectionObject.data[0][elementId] = {
                            id: null,
                            value: "اختر",
                        };
                    } else {
                        sectionObject.data[0][elementId] = {
                            id: elementValue,
                            value: element.options[element.selectedIndex]
                                ? element.options[element.selectedIndex].textContent
                                : "",
                        };
                    }
                    sectionObject.columns.push({
                        name: elementId,
                        type: "NVARCHAR(60)",
                        isreferences: true,
                    });
                } else if (
                    (element.getAttribute("type") == "datetime" ||
                        element.getAttribute("type") == "datetime-local") &&
                    $('input[name="status"]:checked').val() != "offline"
                ) {
                    sectionObject.data[0][elementId] = new Date(elementValue);
                    sectionObject.columns.push({
                        name: elementId,
                        type: element.getAttribute("data-type"),
                        isreferences: false,
                    });
                } else {
                    sectionObject.data[0][elementId] = elementValue;
                    sectionObject.columns.push({
                        name: elementId,
                        type: element.getAttribute("data-type"),
                        isreferences: false,
                    });
                }
            });
            invoice.push(sectionObject);
        }
    });
    if (!valid) {
        return swal("املئ جميع البيانات" + message);
    }
    if ($('input[name="status"]:checked').val() == "offline") {
        const request = indexedDB.open("InvoicesDB", 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("Invoices")) {
                db.createObjectStore("Invoices", {
                    keyPath: "sr",
                    autoIncrement: true,
                });
                db.close();
            }
        };
        request.onsuccess = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("Invoices")) {
                db.createObjectStore("Invoices", {
                    keyPath: "sr",
                    autoIncrement: true,
                });
            }
            const transaction = db.transaction("Invoices", "readwrite");
            const objectStore = transaction.objectStore("Invoices");
            const addRequest = objectStore.add(invoice);

            addRequest.onsuccess = function (event) {
                // The 'sr' value after adding the invoice
                $(`#${getpar("tbh")} input`)[1].value = event.target.result;
                swal("تم الحفظ بالذاكرة المؤقتة.");
            };

            addRequest.onerror = function (event) {
                swal("خطأ بالحفظ");
            };
            transaction.onerror = function (event) {
                swal("خطأ بالحفظ");
            };

            // Close the connection to the database
            db.close();
        };
    } else {
        let message = "";
        if (getpar("tbh").toLowerCase() == "finance_journal_header") {
            if ($("#debit_value_total").text() != $("#credit_value_total").text()) {

                let debitTotal = parseFloat($("#debit_value_total").text()) || 0;
                let creditTotal = parseFloat($("#credit_value_total").text()) || 0;

                let difference = 0;
                let acctype = ''; // "مدين" أو "دائن"

                if (debitTotal > creditTotal) {
                    acctype = 'مدين';
                    difference = debitTotal - creditTotal;
                } else {
                    acctype = 'دائن';
                    difference = creditTotal - debitTotal;
                }

                  message = `القيد غير متوازن، الفارق ${acctype} بقيمة ${difference.toFixed(2)}`;
            }
        }
        if (message == "") {
            loading("savingInvoice");
            console.log("Invoice", invoice);
            $.post(
                "../../api/invoice",
                { id: "save", data: JSON.stringify(invoice) },
                function (data) {
                    if (
                        Number(data[0].insertResult) >= 0 &&
                        Number(data[0].updateResult) >= 0 &&
                        Number(data[1].insertResult) >= 0 &&
                        Number(data[1].updateResult) >= 0
                    ) {
                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cols: "Header_Number",
                                cond: " ID ='" + $("#id_hdr").val() + "'",
                            },
                            function (data) {
                                unloading("savingInvoice");
                                if (data[0].Header_Number) {
                                    $("#header_number_hdr").val(data[0].Header_Number);
                                    $("#subTables section").each((idx, s) => {
                                        $.post(
                                            "../../r/j",
                                            {
                                                tb: $(s).attr("id"),
                                                tbtype: "view",
                                                cond: "Header_ID = '" + $("#id_hdr").val() + "'",
                                            },
                                            (dataf) => {
                                                unloading("Get_Number");

                                                showSubTable($(s).attr("id"), dataf);
                                                SubTableFunctionalities($(s).attr("id"));
                                            }
                                        );
                                    });
                                    swal("تم الحفظ");
                                }
                            }
                        );
                    } else {
                        unloading("savingInvoice");
                        swal("خطأ بالحفظ");
                    }
                }
            );
        } else {
            swal(message);
        }
    }
}

function showHeader(header) {
    console.log("header", header);

    Object.keys(header).map((obj) => {
        if (
            document.getElementById(`${obj.toLowerCase()}_hdr`)?.localName == "select"
        ) {
            let op = $(`#${obj.toLowerCase()}_hdr option`).filter(function () {
                return (
                    $(this).text() === header[obj] || $(this).text() == header[obj]?.value
                );
            });
            if (op.length > 0) {
                $(`#${obj.toLowerCase()}_hdr`).val($(op[0]).attr("value"));
                $("#exchange_rate_hdr")
                    .closest(".inputgroup")
                    .attr("style", "width:fit-content;");
                $(`#subTables tfoot #exchange_rate`).val($(`#exchange_rate_hdr`).val());
                $(`#subTables tfoot #currency_id`).val($(`#currency_name_hdr`).val());
                $(`#subTables tfoot #currency_id`).attr(
                    "value",
                    $(`#currency_name_hdr`).val()
                );
            } else {
                if (obj.toLowerCase() == "currency_name") {
                    $("#currency_name_hdr").val(
                        $('#currency_name_hdr option:contains("EGP")').val()
                    );
                    $('#currency_name_hdr option:contains("EGP")').attr(
                        "selected",
                        "selected"
                    );
                    $(`#exchange_rate_hdr`).val(1);
                    $("#exchange_rate_hdr")
                        .closest(".inputgroup")
                        .attr("style", "width:fit-content;display:none !important");
                    $(`#subTables tfoot #exchange_rate`).val(
                        $(`#exchange_rate_hdr`).val()
                    );
                    $(`#subTables tfoot #currency_id`).val($(`#currency_name_hdr`).val());
                    $(`#subTables tfoot #currency_id`).attr(
                        "value",
                        $(`#currency_name_hdr`).val()
                    );
                } else {
                    $(`#${obj.toLowerCase()}_hdr`).val("default");
                }
            }
        } else if ($(`#${obj.toLowerCase()}_hdr`)?.attr("type") == "date") {
            $(`#${obj.toLowerCase()}_hdr`)?.val(header[obj].replaceAll("/", "-"));
        } else if (
            $(`#${obj.toLowerCase()}_hdr`)?.attr("type") == "datetime-local" &&
            $('input[name="status"]:checked').val() != "offline" &&
            obj.toLowerCase() !== "begin_date"
        ) {
            $(`#${obj.toLowerCase()}_hdr`)?.val(
                header[obj].replaceAll("/", "-").split(" ")[0] + "T12:00"
            );
        } else {
            $(`#${obj.toLowerCase()}_hdr`)?.val(header[obj]);
            $(`#${obj.toLowerCase()}_hdr`)?.attr("value", header[obj]);
        }

        return obj;
    }, {});
    setTimeout(() => {
        if ($("#exchange_rate_hdr").val() == "1") {
            $("#exchange_rate_hdr")
                .closest(".inputgroup")
                .attr("style", "width:fit-content;display:none !important;");
        }
    }, 0);
    $(`#subTables tfoot #exchange_rate`).val($(`#exchange_rate_hdr`).val());
    $(`#subTables tfoot #currency_id`).val($(`#currency_name_hdr`).val());
    $(`#subTables tfoot #currency_id`).attr(
        "value",
        $(`#currency_name_hdr`).val()
    );
    $(`#subTables input[data-reference="${getpar("tbh").toLowerCase()}"]`).val(
        header["ID"]
    );
    $(`#subTables input[data-reference="${getpar("tbh").toLowerCase()}"]`).attr(
        "value",
        header["ID"]
    );
}

function showSubTable(elementId, data) {
    $(`#${elementId} tbody`).html("");
    data
        .sort((a, b) => a.sr - b.sr)
        .map((obj, idx) => {
            let expression = $(`#${elementId}_totalFunction`).attr(
                "data-totalFunction"
            );
            let columnNames = "";
            if (expression || expression != undefined) {
                columnNames = expression
                    .match(/row\.(\w+)/g)
                    .map((match) => match.split(".")[1]);
            }
            let row = {};
            let html = `<tr ${obj["IsDelete"] == 1 || obj["isdelete"] == 1
                ? 'style="display:none"'
                : ""
                }><td class='nodata' style='display: flex;align-items: center;justify-content: space-evenly;'><i class='deleteSubTr material-icons py-2' style='cursor:pointer;color:#f44336;'>delete</i><a class="opsearch" href="../../ERP/tablet?tbname=${elementId}&xxx=${obj["ID"]
                }&colx=ID&hidefrm=true" target="_blank"> <i class="ace-icon fa fa-search-plus" aria-hidden="true"></i></a></td>`;
            $(
                `#${elementId} tfoot tr:nth-child(2) td > input, #${elementId} tfoot tr:nth-child(2) td div:not(.visual) > *:not(span):not(a):not(ul):not(div)`
            ).each((idx2, i) => {
                let name = $(i).attr("data-colname");
                if (columnNames?.includes(name)) {
                    row[name] = obj[name];
                }
                if (i.localName == "select") {
                    html += `<td class='${name}'  id='${name?.toLowerCase()}' data-id='${$(
                        i
                    ).val()}' style='${$(i).closest("td").attr("style")}'>${$(i).attr("readonly")
                        ? `<span id>${obj[name].value}</span>`
                        : `<select id='${name?.toLowerCase() + idx}' style='${$(i).attr(
                            "style"
                        )}' ${$(i).attr("readonly") ? "readonly" : ""} data-type='${$(
                            i
                        ).attr("data-type")}'></select>`
                        }</td>`;
                } else {
                    if (name?.toLowerCase() == "account_code") {
                        let account_code = references_tb
                            ?.find(
                                (r) => r.referenced_mainCol.toLowerCase() == "account_code"
                            )
                            ?.referenced_data?.find(
                                (r) => r.ID == obj[name] || r.ID == $(i).val()
                            );

                        let account_tree = references_tb
                            ?.find(
                                (r) => r.referenced_mainCol.toLowerCase() == "account_tree"
                            )
                            ?.referenced_data?.find(
                                (r) =>
                                    r.Account_name == account_code.Tree_ID ||
                                    r.ID == account_code.Tree_ID
                            ).ID;
                        html += `
            <td class='nodata' id='account_tree' data-type='${$(i).attr(
                            "data-type"
                        )}' style='${$(i)
                            .closest("td")
                            .attr(
                                "style"
                            )}'><input class='visual' data-colname='Tree_id' id='account_tree${idx}' style='${$(
                                i
                            ).attr("style")}' type='${$(i).attr("type")}' ${$(i).attr("readonly") ? "readonly" : ""
                            } is_nullable='${$(i).attr(
                                "is_nullable"
                            )}' value='${account_tree}'></td>
            <td id='account_oldCode'><span style='color:black;background:#bcd4e0;display:flex;padding: 4px 6px;border-radius: 6px;height:30px;'>${account_code.Account_Code
                            }</span></td><td id='${name.toLowerCase()}' class='${name}' data-type='${$(
                                i
                            ).attr("data-type")}' style='${$(i)
                                .closest("td")
                                .attr("style")}'><input data-colname='${name}' id='${name?.toLowerCase() + idx
                            }' style='${$(i).attr("style")}' type='${$(i).attr("type")}' ${$(i).attr("readonly") ? "readonly" : ""
                            } is_nullable='${$(i).attr("is_nullable")}' value='${obj[name] ? obj[name] : $(i).val()
                            }'></td>`;
                    } else {
                        html += `<td class='${name}' id='${name?.toLowerCase()}' data-type='${$(
                            i
                        ).attr("data-type")}' style='${$(i)
                            .closest("td")
                            .attr("style")}'><input data-colname='${name}' id='${name?.toLowerCase() + idx
                            }' style='${$(i).attr("style")}' type='${$(i).attr("type")}' ${$(i).attr("readonly") ? "readonly" : ""
                            } is_nullable='${$(i).attr("is_nullable")}' value='${obj[name] ? obj[name] : $(i).val()
                            }'></td>`;
                    }
                }
                if (
                    $(`#${name?.toLowerCase()}_hdr`).length > 0 &&
                    $(i).attr("is_show") == "false" &&
                    name?.toLowerCase() !== "id" &&
                    name?.toLowerCase() !== "sr" &&
                    name?.toLowerCase() !== "nots"
                ) {
                    value = $(`#${name?.toLowerCase()}_hdr`).val();
                }
            });

            if ($(`#${elementId}_totalFunction`).length > 0) {
                html += `<td class='totalFunction' style='text-align=center;'>${eval(
                    expression
                )}</td>`;
            }

            $(`#${elementId} tbody`).append(html);

            $(`#${elementId} tfoot tr:nth-child(2) td .autocomplete`).each(
                (idx2, s) => {
                    let mainCol =
                        $(s).attr("id") == "account_treeF"
                            ? "account_tree"
                            : $(s).attr("data-colname");
                    let refTb = references_tb?.filter(
                        (r) => r.referenced_mainCol == mainCol
                    )[0];
                    let suggestions = [];
                    refTb.referenced_data.forEach((d) => {
                        suggestions.push({
                            ID: d["ID"],
                            values: refTb.referenced_columns.split(",").map((c) => d[c]),
                            headers: refTb.referenced_columns.split(",").map((c) => c),
                        });
                    });
                    let nameid = $(s).attr("id") + idx;
                    let selid = obj[$(s).attr("data-colname")];
                    if ($(s).attr("id") == "account_treeF") {
                        nameid = "account_tree" + idx;
                        selid = $(`#${nameid}`).val();
                    }
                    $(`#${nameid.toLowerCase()}`).on("focus", () => {
                        autocomplete(nameid.toLowerCase(), suggestions);
                    });
                    let selected = suggestions.find(
                        (s) => s.ID == selid || s.Account_name == selid
                    );
                    $(`#${nameid.toLowerCase()}`).val(selected?.values[0]);
                    $(`#${nameid.toLowerCase()}`).attr("data-id", selected?.ID);
                    $(`#${nameid.toLowerCase()}`).attr("data-code", selected?.values[2]);
                    $(`#${nameid.toLowerCase()}`).attr("data-tree", selected?.values[1]);
                    $(`#${nameid.toLowerCase()}`).attr("value", selected?.ID);

                    if ($(`#${$(s).attr("id").toLowerCase()}_hdr`).length > 0) {
                        let value =
                            $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr("data-id") ==
                                "" ||
                                $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr("data-id") ==
                                undefined
                                ? $(`#${$(s).attr("id").toLowerCase()}_hdr`).val()
                                : $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr("data-id");
                        selected = suggestions.find((s) => s.ID == value);
                        setTimeout(() => {
                            $(s).val(selected?.values[0]);
                            $(s).attr("data-id", selected?.ID);
                        }, 0);
                    }
                }
            );

            $(`#${elementId} tfoot tr:nth-child(2) td select`).each((idx2, s) => {
                let refTb = references_tb.filter(
                    (r) => r.referenced_mainCol == $(s).attr("id")
                )[0];
                refTb.referenced_data.forEach((d) => {
                    $(`#${$(s).attr("id").toLowerCase() + idx}`).append(
                        `<option  value="${d.ID}">${d[refTb.referenced_columns.split(",")[0]]
                        }</option>`
                    );
                });

                $(`#${$(s).attr("id") + idx}`).select2();

                let selectedValue = obj[$(s).attr("id")]?.id
                    ? obj[$(s).attr("id")].id
                    : obj[$(s).attr("id")];
                let selectedText = $(`#${$(s).attr("id")} option`).filter(
                    (idx, option) => $(option).val() == selectedValue
                )[0]?.textContent;
                $(`#${$(s).attr("id") + idx}`).val(selectedValue);
                $(`#select2-${$(s).attr("id") + idx}-container`).text(selectedText);
            });

            let sumTlt = 0;
            $(`#${elementId} tbody tr:not([style*="display: none;"])`).each(
                (idx, tr) => {
                    sumTlt += Number($(tr).find(" td:last").text());
                }
            );
            $(`#${elementId}_totalFunction`).text(sumTlt.toFixed(2));
            $(
                `#${elementId} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
            ).val("");
            $(
                `#${elementId} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
            ).attr("data-code", "");
            $(
                `#${elementId} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
            ).attr("data-tree", "");
            $(
                `#${elementId} tfoot tr:nth-child(2) td:not([style*="display:none"]) > span`
            ).text("");
            $(`#${elementId} tfoot tr:nth-child(2) #sr`).val(idx + 2);
            setTimeout(() => {
                if (
                    Array.from(
                        document.querySelectorAll(
                            "input#exchange_rate, #exchange_rate input"
                        )
                    ).every((input) => input.value == "1")
                ) {
                    $(`#${elementId} tr`).find(".totalFunction").hide();
                    $(`#${elementId} tr`).find(".exchange_rate").hide();
                    // $(".exchange_rate").hide();
                } else {
                    $(`#${elementId} tr`).find(".totalFunction").show();
                    $(`#${elementId} tr`).find(".exchange_rate").show();
                    //  $(".exchange_rate").show();
                }
            }, 0);
            $(`#${elementId} tfoot tr:nth-child(2) #exchange_rate`).val(
                $("#exchange_rate_hdr").val()
            );
            $(
                `#${elementId} tfoot tr:nth-child(2) td:not([style*="display:none"]) select`
            ).val("default");
            $(".deleteSubTr")
                .off("click")
                .on("click", (i) => {
                    if (
                        !getCookie("usersgroups").split(",").includes("administrators") &&
                        new Date(document.getElementById("header_date_hdr").value) <
                        new Date(2023, 6, 30) &&
                        window.location.host.toLowerCase() == "elkawmiah.mas.com.eg"
                    ) {
                        swal("ليس لديك صلاحية!");
                    } else {
                        $(i.target).closest("tr").hide();
                        $(i.target).closest("tr").find(" td#isdelete input").val("true");
                        SubTableFunctionalities(elementId);
                        let sumTlt = 0;
                        $(`#${elementId} tbody tr:not([style*="display: none;"])`).each(
                            (idx, tr) => {
                                sumTlt += Number($(tr).find(" td:last").text());
                            }
                        );
                        $(`#${elementId}_totalFunction`).text(sumTlt.toFixed(2));
                        $(`#${elementId} tfoot tr:nth-child(2) #sr`).val(idx + 2);
                    }
                });
            subTableInputsChange(elementId);
        });
    buildContextMenu(elementId);
}

function subTableInputsChange(elementId) {
    $(`#${elementId} table input`).on("input", (e) => {
        if ($(`#${elementId}_totalFunction`).length > 0) {
            let expression = $(`#${elementId}_totalFunction`).attr(
                "data-totalFunction"
            );
            let columnNames = "";
            if (expression || expression != undefined) {
                columnNames = expression
                    .match(/row\.(\w+)/g)
                    .map((match) => match.split(".")[1]);
            }
            let row = {};
            $(`#${elementId} tbody tr:not([style*="display: none;"])`).each(
                (idx2, tr) => {
                    $(tr)
                        .find(" td input")
                        .each((idx3, i) => {
                            let name = $(i).attr("data-colname");
                            if (columnNames?.includes(name)) {
                                row[name] = $(i).val();
                            }
                        });

                    $(tr).find("td:last-child").html(eval(expression));
                }
            );
            let sumTlt = 0;
            $(`#${elementId} tbody tr:not([style*="display: none;"])`).each(
                (idx, tr) => {
                    sumTlt += Number($(tr).find(" td:last").text());
                }
            );
            $(`#${elementId}_totalFunction`).text(sumTlt.toFixed(2));
        }

        if ($(e.target).attr("data-colname") == "Debit_value") {
            $(e.target)
                .closest("tr")
                .find('input[data-colname="Credit_Value"]')
                .val(0);
        }
        if ($(e.target).attr("data-colname") == "Credit_Value") {
            $(e.target)
                .closest("tr")
                .find('input[data-colname="Debit_value"]')
                .val(0);
        }
        SubTableFunctionalities(elementId);
    });
}

function SubTableFunctionalities(elementId) {
    $(`#${elementId} tfoot tr:nth-child(2) td`).each((idx3, i2) => {
        if ($(i2).find(" input").attr("function_name")) {
            let val = 0;

            let funcnameli = $(i2).find(" input").attr("function_name");
            if (funcnameli) {
                console.log("function_name", funcnameli);

            }

            $(`#${elementId} tbody tr:not(:hidden)`).each((idx4, tr) => {
                if ($(i2).find(" input").attr("function_name") == "sum") {
                    val += Number(
                        $(tr)
                            .find(` td:nth-child(${idx3 + 1}) input`)
                            .val()
                    );
                } else if ($(i2).find(" input").attr("function_name") == "avg") {
                }
            });
            $(`#${elementId} tfoot tr:nth-child(1) td:nth-child(${idx3 + 1})`).html(
                `<span id='${$(i2).find(" input").attr("id")}_total'>${val.toFixed(
                    2
                )}</span>`
            );
        }
        console.log("j", $(i2));
        if (
            $(i2).attr("class")?.toLowerCase() == "nots" &&
            getpar("tbh").toLowerCase() == "finance_journal_header"
        ) {
            $(`#${elementId} tfoot tr:nth-child(1) td:nth-child(${idx3 + 1})`).html(
                `<span id='journal_total'>${(
                    parseFloat($("#debit_value_total").text()) -
                    parseFloat($("#credit_value_total").text())
                ).toFixed(2)}</span>`
            );
        }
    });
}
class Invoice {
    constructor(tbh) {
        loading(tbh + "_data_load");
        let data_array = getPureJson(
            postSync("../../api/v1/data", {
                name: "structure_info",
                parameters: JSON.stringify([
                    { name: "@tbh", value: tbh, type: "nvarchar" },
                    { name: "@compid", value: getCookie("CompId"), type: "nvarchar" },
                ]),
            })
        );
        let data = data_array[0];

        // if (data.columns_info == null) {
        //   postSync("../../ERP/proced", {
        //     id: `structure_build '${tbh}','${getCookie("CompId")}'`,
        //   });
        //   data_array = getPureJson(
        //     postSync("../../api/v1/data", {
        //       name: "structure_info",
        //       parameters: JSON.stringify([
        //         { name: "@tbh", value: tbh, type: "nvarchar" },
        //         { name: "@compid", value: getCookie("CompId"), type: "nvarchar" },
        //       ]),
        //     })
        //   );
        // }

        unloading(tbh + "_data_load");
        this.INVID = uuidv4().replace("-", "");
        this.info = data.object_info.filter(
            (obj) => obj.table_name?.toLowerCase() == getpar("tbh").toLowerCase()
        )[0];

        this.columns = data.columns_info;
        this.children = data.children_info;
        console.log("children", this.children);

        let elementID = tbh + "_elm";
        addElmentID(elementID, 'class="row invoice_div"');
        this.elementID = elementID;

        this.#buildInvoiceelement();

        eval("window." + this.info.tbh + "_invoice = this");
        loading("loading");
        setTimeout(() => {
            if (getpar("inv").length > 0) {
                let _repo = this;
                loading("Get_Number");
                try {
                    $.post(
                        "../../r/j",
                        {
                            tb: getpar("tbh"),
                            tbtype: "tableid",
                            cond: "Header_Number = '" + getpar("inv") + "'",
                        },
                        function (data) {
                            unloading("loading");
                            if (data.length > 0) {
                                if (data[0].ID) {

                                    showHeader(data[0]);

                                    _repo.children
                                        .filter(
                                            (c) =>
                                                c.is_show == true &&
                                                (c.type == "table" || c.type == "tableid")
                                        )
                                        .map((c) => {
                                            $.post(
                                                "../../r/j",
                                                {
                                                    tb: c.FKTABLE_NAME,
                                                    tbtype: "view",
                                                    cond: "Header_ID = '" + data[0].ID + "'",
                                                },
                                                (dataf) => {
                                                    unloading("Get_Number");

                                                    showSubTable(c.FKTABLE_NAME, dataf);
                                                    SubTableFunctionalities(c.FKTABLE_NAME);
                                                }
                                            );
                                        });
                                }
                            } else {
                                swal("فاتورة غير صحيحه");
                                unloading("Get_Number");
                            }
                        }
                    );
                } catch (err) {
                    unloading("Get_Number");
                    swal("فاتورة غير صحيحه");
                }
            }
            unloading("loading");
        }, 5000);
    }

    #buildInvoiceelement() {
        $(Document).ready(() => {
            $(".fixed-plugin").append(`<a onclick='${this.#appendEditPage(
                $("#editSave input:checked").val(),
                getpar("tbh")
            )}' data-bs-toggle="modal" data-bs-target="#editDocumentPage" id='editDocument' class="fixed-plugin-button text-dark position-fixed px-3 py-2" style='${getCookie("UserLang") == "ar" ? "left" : "right"
                }:170px'>
  <i class="material-icons py-2">edit</i>
</a>`);
            $("#editSave input")
                .off("click")
                .on("click", (e) => {
                    this.#appendEditPage(
                        $(e.target).val(),
                        $("#chooseTableInpt option:selected").html()
                    );
                });
            $("#showColumnsEdit")
                .off("click")
                .on("click", (e) => {
                    $("#showColumnsEdit").addClass("active");
                    $("#showTablesEdit").removeClass("active");
                    $("#header_ColumnsContainer").show();
                    $("#header_TablesContainer").hide();
                    $("#body_ColumnsContainer").show();
                    $("#body_TablesContainer").hide();
                });
            $("#showTablesEdit")
                .off("click")
                .on("click", (e) => {
                    $("#showColumnsEdit").removeClass("active");
                    $("#showTablesEdit").addClass("active");
                    $("#header_ColumnsContainer").hide();
                    $("#header_TablesContainer").show();
                    $("#body_ColumnsContainer").hide();
                    $("#body_TablesContainer").show();
                });
            $("#chooseTableInpt").on("change", () => {
                let ctb = $("#chooseTableInpt option:selected").html();
                this.#appendEditPage($("#editSave input:checked").val(), ctb);
                $("#editDocumentPage").show();
                $("#editDocumentPage").css("opacity", 1);
            });
        });

        $("#header_ColumnsContainer").show();
        $("#header_TablesContainer").hide();
        $("#body_ColumnsContainer").show();
        $("#body_TablesContainer").hide();
        this.#appendEditPage("company", getpar("tbh"));
        this.#appendHeader();
        setTimeout(() => {
            this.#appendSubTables();
        }, 1000);
        this.#appendPopUps();

        // $(".autotrans").each(function () {
        //   $(this).text($(this).data("name" + getCookie("UserLang")));
        // });
    }
    #appendHeader() {
        let _repo = this;
        if ($("#" + this.elementID + "_header").length == 0) {
            $("#" + this.elementID).prepend(
                `<div class="d-flex align-items-center gap-3 justify-content-center">
  <i class="ace-icon fa fa-leaf green"></i> <h3 id="${this.elementID
                }_header" class="text-center mb-3 InvoiceTitle"></h3>
  </div>
<!------------------------------->
<div class="d-flex header_bottom justify-content-between align-items-center">
  <div class="col-5 row justify-content-between align-items-center">
    <div class="col-12 d-flex btn-corner gap-2">
      <button id="saveInv" data-toggle="tooltip" data-placement="left" title="حفظ"
        class="btn bg-gradient-success d-flex justify-content-center align-items-center">
        <i class="ace-icon fa fa-floppy-o"></i>
      </button>
      <button id="printInv" data-toggle="tooltip" data-placement="left" title="طباعه"
        class="btn bg-gradient-info d-flex justify-content-center align-items-center"
        >
        <i class="ace-icon fa fa-print"></i>
      </button>
      <button data-placement="left" id="approv"
        class="btn bg-gradient-secondary d-flex justify-content-center align-items-center" title="ترحيل">
        <i class="ace-icon fa fa-cloud-upload"></i>
      </button>
      <button data-placement="left" id="deleteapprov"
        class="btn bg-gradient-danger d-flex justify-content-center align-items-center" title="تراجع ترحيل">
        <i class="ace-icon fa fa-cloud-download"></i>
      </button>
       <button data-placement="left" id="finRepo"
        class="btn bg-gradient-secondary d-flex justify-content-center align-items-center" title="اعتماد مالي">
        <i class="ace-icon fa fa-flag"></i>
      </button>
      <button data-placement="left" id="advance" onclick="window.open('../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${getpar(
                    "tbh"
                )}', '_blank')"
        class="btn bg-gradient-info d-flex justify-content-center align-items-center" title="متقدم">
        <i class="ace-icon fa fa-edit"></i>
      </button>
      <button data-placement="left" id="refresh" onclick='location.reload()'
        class="btn bg-gradient-warning d-flex justify-content-center align-items-center" title="جديد">
        <i class="ace-icon fa fa-refresh"></i>
      </button>
      <button id="dellinv" data-toggle="tooltip" data-placement="left" title="Delete"
        class="btn bg-gradient-danger d-flex justify-content-center align-items-center">
        <i class="ace-icon fa fa-trash-o"></i>
      </button>
    </div>
  </div>
  <!------------------------------->
  <div class="col-7 row align-items-center justify-content-end">
    <div class='col-2'>
      <label style='width:max-content;font-size:11px;'>
        <input type="radio" name="status" value="offline" id="offlineStatus">${getCookie("UserLang") == "ar" ? "الذاكرة المؤقتة" : "Offline"
                }
      </label>
       <label style='width:max-content;font-size:11px;'>
        <input type="radio" name="status" value="online" id="onlineStatus" checked>${getCookie("UserLang") == "ar" ? "الذاكرة الرئيسية" : "Online"
                }
      </label>
    </div>
    <div class="col-1 upp input-group input-group-outline my-3" style="width:120px;">
      <label class="form-label" id="invidx_lbl" style="width:97px">
      </label>
      <input type="text" class="form-control" id="invidx">
    </div>

    <div class="col-6 d-flex gap-3 align-items-center">
      <button id="first" class=" btn bg-gradient-secondary" title="first record" style="width:500px !important;">
        |< </button>
          <button id="back" class=" btn bg-gradient-dark" title="previous record" style="width: 100% !important;">
            <i class="ace-icon fa fa-angle-double-right"></i>
          </button>
          <button id="next" class=" btn bg-gradient-dark" title="next record" style="width: 100% !important;">
            <i class="ace-icon fa fa-angle-double-left"></i>
          </button>
          <button id="last" class=" btn bg-gradient-secondary" title="Last record" style="width: 100% !important;">
            >|
          </button>
    </div>
  </div>
  <div class="col-md-4 col-sm-6">

  </div>
</div>
<section id='${getpar(
                    "tbh"
                )}' class='row' style='justify-content:center;align-items:center;'></section>
<div id='subTables'></div>`
            );
        }
        $("#printInv").click(function () {
            if (
                $("#id_hdr").val() == "" ||
                $("#id_hdr").val() == null ||
                $("#header_number_hdr").val() == "0"
            ) {
                swal("يجب إختيار مستند أولاً!");
            } else {
                if (getpar("tbh").toLowerCase() == "finance_cash_payable_header") {
                    var url = `../../Pos_report/Print_bill_A4?ti=${$(
                        ".InvoiceTitle"
                    ).text()}`;
                    $.post(
                        "../../Finance/encreport/",
                        {
                            sl: "EAAAAE5uZHW6Fg/BkAIkOXUPd0dZK3xWBKnmkgHvQlGoApRfGt8WginbIC6RBoLJ86IwG72bwlyCA3n5WIaBbX5yfN4pFVJz3DNipcdFfAPg1Gbg",
                        },
                        function (data, succ) {
                            url += "&sl1=" + data;
                            $.post(
                                "../../Finance/encreport/",
                                {
                                    sl: "EAAAAL36+uTSrP7I2LideGqYPv7k7rEe2t7Pb0YIf3YPKDy8pvHZfJRAyVi7TtPbqpKlVGEQMkOLMpSCmvky64vAg2ri4mBYVsDlFEDHEZphnQG2",
                                },
                                function (data2, succ) {
                                    url += "&sl2=" + data2;
                                    url += "&ID1=" + $("#id_hdr").val();
                                    var win = window.open(url, "_blank");

                                    try {
                                        win.focus();
                                    } catch (err) {
                                        window.location = url;
                                    }
                                }
                            );
                        }
                    );
                } else if (
                    getpar("tbh").toLowerCase() == "finance_cash_receivable_header"
                ) {
                    var url = "../../Pos_report/Print_bill_A4?ti= استلام نقدية";

                    $.post(
                        "../../ERP/encreport",
                        {
                            sl: "EAAAALkYvyZWg1Dd2sOLfzNfztC0/JLs4OBdnwXqCzW7ZwRrzM4FKc/ku9xirmIzpiNsst9a/anpabn6grk1Z641BhN+RMup9Yi+7k3odpN0FRvpb72JAWCx6Kty7TVa9Vs1Zw==",
                        },
                        function (datag, suc) {
                            url += "&sl1=" + datag;

                            $.post(
                                "../../ERP/encreport",
                                {
                                    sl: "EAAAANMvewzh/UyTWj7L3eKszglMuf5uk1BuGrWwSkbmVDjezVF1b6HQWBkOBx96Ao/3LcVtvgdPKRUxq3kN1F66Qbpzn3gST8ZyKahEF2rc1zic",
                                },
                                function (datay, suc) {
                                    url += "&sl2=" + datay;
                                    url += "&ID1=" + $("#id_hdr").val();

                                    var win = window.open(url, "_blank");
                                    win.focus();
                                    //   window.location.href = url;
                                }
                            );
                        }
                    );
                } else if (
                    getpar("tbh").toLowerCase() == "finance_bank_payable_header"
                ) {
                    var url = "../../Pos_report/Print_bill_A4?ti=يومية صرف بنكية";

                    $.post(
                        "../../ERP/encreport",
                        {
                            sl: "EAAAALYOYFC2tdNuW6j6eT0QNucioqFFZrlphfUXpczoCPf5cXOrklkcGIJndK8M3BDZ/O/Moc1BYOd8eGfc3fR1q/pfn/1NFqPyZsepXawbMQBb",
                        },
                        function (datag, suc) {
                            url += "&sl1=" + datag;

                            $.post(
                                "../../ERP/encreport",
                                {
                                    sl: "EAAAACs7pTso44jp7eI+fyjIfOHSvnigyzJ7tal7E7ziSQKN/vLk+3+IqHrGQHHYdDM0AWl5ayNVbrclIWsdsXS/vzpgl0RwOmtQMtni/t49JyFH",
                                },
                                function (datay, suc) {
                                    url += "&sl2=" + datay;
                                    url += "&ID1=" + $("#id_hdr").val();

                                    var win = window.open(url, "_blank");
                                    win.focus();
                                    //   window.location.href = url;
                                }
                            );
                        }
                    );
                } else if (
                    getpar("tbh").toLowerCase() == "finance_bank_receivable_header"
                ) {
                    var url = "../../Pos_report/Print_bill_A4?ti=يومية استلام بنكية";

                    $.post(
                        "../../ERP/encreport",
                        {
                            sl: "EAAAAGX5k6BXv5OIDVQkSotmlX6Efpun5Cfrkt9r/Y82WZzIL6fgo7MWzycs2CO0gxUd+qlL44QiB9mIcpc8bpvqB/mjz3pA3eiPonWG3WHOi99c",
                        },
                        function (datag, suc) {
                            url += "&sl1=" + datag;

                            $.post(
                                "../../ERP/encreport",
                                {
                                    sl: "EAAAAEZWiKb0ZAPh1c5rPTnPcJ30GJ5yMK8QGBHnrvmR39v5Fbmm2Gm1JRjCcDERSPrlJLYovgY8yWzq7+4atOsXsOPkw/c4pkjigixejULaIX6E",
                                },
                                function (datay, suc) {
                                    url += "&sl2=" + datay;
                                    url += "&ID1=" + $("#id_hdr").val();

                                    var win = window.open(url, "_blank");
                                    win.focus();
                                    //   window.location.href = url;
                                }
                            );
                        }
                    );
                } else {
                    var url = `../../Pos_report/Print_bill_A4?ti=${$(
                        ".InvoiceTitle"
                    ).text()}`;
                    $.post(
                        "../../Finance/encreport/",
                        {
                            sl: "EAAAABxAtcehPM0HHSZyKVb3yiKFdD7ianyeCmQHuc47eKs3H6OcUJ3q8WY5N0g1tHbQvbx8KoJCLvRmfBd3b2/BC588hcd+zn3Shx+D0YI09GTi",
                        },
                        function (data, succ) {
                            url += "&sl1=" + data;
                            $.post(
                                "../../Finance/encreport/",
                                {
                                    sl: "EAAAAI18wWpZEBTx8/Mvt4QgnStISQJyMuuxc1gW07uPJqw9SeFYu3jtAxdnyTm9ei9cQgEVsomGObkW3svY1I8Z5+gni+VNK2KGK4R3brIEHo7H",
                                },
                                function (data2, succ) {
                                    url += "&sl2=" + data2;
                                    url += "&ID1=" + $("#id_hdr").val();
                                    var win = window.open(url, "_blank");

                                    try {
                                        win.focus();
                                    } catch (err) {
                                        window.location = url;
                                    }
                                }
                            );
                        }
                    );
                }
            }
        });
        $("#approv")
            .off("click")
            .on("click", () => {
                loading("finapprove");
                $.post(
                    "../../r/j",
                    {
                        tb: getpar("tbh"),
                        tbtype: "tableid",
                        cols: "ID",
                        cond: "Header_Number = '" + $("#header_number_hdr").val() + "'",
                    },
                    function (data) {
                        if (data[0].ID) {
                            $.post(
                                "../../erp/proced",
                                { id: "Fin_dtl_table2_upg_id '" + data[0].ID + "'" },
                                function (data) {
                                    unloading("finapprove");
                                    swal("تم الترحيل" + data);
                                }
                            );
                        } else {
                            swal("يجب حفظ القيد أولاً");
                        }
                    }
                );
            });

        $("#deleteapprov")
            .off("click")
            .on("click", () => {
                loading("finapprove");
                $.post(
                    "../../r/j",
                    {
                        tb: getpar("tbh"),
                        tbtype: "tableid",
                        cols: "ID",
                        cond: "Header_Number = '" + $("#header_number_hdr").val() + "'",
                    },
                    function (data) {
                        if (data[0].ID) {
                            $.post(
                                "../../erp/proced",
                                { id: "Fin_dtl_table2_delete_id '" + data[0].ID + "'" },
                                function (data) {
                                    unloading("finapprove");
                                    swal("تم التراجع عن ترحيل" + data);
                                }
                            );
                        } else {
                            swal("يجب حفظ القيد أولاً");
                        }
                    }
                );
            });
        $("#finRepo")
            .off("click")
            .on("click", () => {
                window.open(
                    `../../WEB/index?id=de897d6d4ed94deca8b996f701ddb7e5finance_approval&finid=${$(
                        "#id_hdr"
                    ).val()}`,
                    "_blank"
                );
            });
        $("#dellinv").click(function () {
            if (
                getCookie("CompName").includes("قومية") &&
                $("#header_date_hdr").val() <= "2023-6-30" &&
                getpar("tbh").toLowerCase() == "finance_journal_header"
            ) {
                swal("لا يمكن حذف قيد قبل تاريخ ٢٠٢٣/٦/٣٠");
                return;
            }
            if (
                !getCookie("usersgroups").split(",").includes("administrators") &&
                new Date(document.getElementById("header_date_hdr").value) <
                new Date(2023, 6, 30) &&
                window.location.host.toLowerCase() == "elkawmiah.mas.com.eg"
            ) {
                swal("ليس لديك صلاحية!");
            } else {
                var idinv = $("#header_number_hdr").val();
                if (idinv != "") {
                    swal(
                        {
                            title: "هل انت متأكد؟",
                            text: "سيتم الحذف نهائياً !",
                            type: "warning",
                            showCancelButton: true,
                            confirmButtonColor: "#DD6B55",
                            confirmButtonText: "نعم احذف!",
                            closeOnConfirm: false,
                        },
                        function () {
                            if ($('input[name="status"]:checked').val() == "offline") {
                            } else {
                                $.post(
                                    "../../erp/proced",
                                    {
                                        id:
                                            "MasInvoice_delete '" +
                                            getpar("tbh") +
                                            "','" +
                                            $("#id_hdr").val() +
                                            "','" +
                                            getCookie("CompId") +
                                            "'",
                                    },
                                    function (data) {
                                        if (data == 1) {
                                            swal(
                                                "Deleted!",
                                                "The Record has been deleted.",
                                                "success"
                                            );
                                            window.location.reload();
                                        } else {
                                            swal(
                                                "خطأ بالحذف يرجي اعادة تحميل الصفحه و المحاولة مره اخري او التواصل مع الدعم الفني!"
                                            );
                                        }
                                    }
                                );
                            }
                        }
                    );
                } else {
                    swal("يجب اختيار فاتورة اولاً", "Wrong Action alert ! ");
                }
            }
        });

        $("#saveInv")
            .off("click")
            .on("click", () => {
                saveInvoice(this.INVID);
            });
        $("#invidx").keypress(function (e) {
            if (e.which == 13) {
                let value = $(this).val();
                if ($('input[name="status"]:checked').val() == "offline") {
                    getData(Number(value)).then((data) => {
                        $("#invidx").val(data.sr);
                        data.forEach((r) => {
                            if (r.name == getpar("tbh")) {
                                showHeader(r.data[0]);
                            } else {
                                showSubTable(r.name, r.data);
                                SubTableFunctionalities(r.name);
                            }
                        });
                    });
                } else {
                    loading("Get_Number");
                    try {
                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cond: "Header_Number = '" + value + "'",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].ID) {
                                        showHeader(data[0]);
                                        _repo.children
                                            .filter(
                                                (c) =>
                                                    c.is_show == true &&
                                                    (c.type == "table" || c.type == "tableid")
                                            )
                                            .map((c) => {
                                                $.post(
                                                    "../../r/j",
                                                    {
                                                        tb: c.FKTABLE_NAME,
                                                        tbtype: "view",
                                                        cond: "Header_ID = '" + data[0].ID + "'",
                                                    },
                                                    (dataf) => {
                                                        unloading("Get_Number");

                                                        showSubTable(c.FKTABLE_NAME, dataf);
                                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                                    }
                                                );
                                            });
                                    }
                                } else {
                                    swal("فاتورة غير صحيحه");
                                    unloading("Get_Number");
                                }
                            }
                        );
                    } catch (err) {
                        unloading("Get_Number");
                        swal("فاتورة غير صحيحه");
                    }
                }
            }
        });
        $("#first")
            .off("click")
            .on("click", () => {
                if ($('input[name="status"]:checked').val() == "offline") {
                    getData("firstInvoice").then((data) => {
                        $("#invidx").val(data.sr);
                        $("#invidx").focus();
                        data.forEach((r) => {
                            if (r.name == getpar("tbh")) {
                                showHeader(r.data[0]);
                                $(`#${getpar("tbh")} input`)[1].value = data.sr;
                            } else {
                                showSubTable(r.name, r.data);
                                SubTableFunctionalities(r.name);
                            }
                        });
                    });
                } else {
                    loading("Get_Number");
                    try {
                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cond:
                                    "Header_Number =  (select Min(Header_Number) from " +
                                    getpar("tbh") +
                                    " x where x.company_id ='" +
                                    getCookie("CompId") +
                                    "' and exists( select ub.ID from  dbo.user_Branches('" +
                                    getCookie("UserID") +
                                    "') ub where ub.ID= x.branch_id and isnull(x.isDelete,0) = 0)     )",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].ID) {
                                        showHeader(data[0]);
                                        _repo.children
                                            .filter(
                                                (c) =>
                                                    c.is_show == true &&
                                                    (c.type == "table" || c.type == "tableid")
                                            )
                                            .map((c) => {
                                                $.post(
                                                    "../../r/j",
                                                    {
                                                        tb: c.FKTABLE_NAME,
                                                        tbtype: "view",
                                                        cond: "Header_ID = '" + data[0].ID + "'",
                                                    },
                                                    (dataf) => {
                                                        unloading("Get_Number");
                                                        showSubTable(c.FKTABLE_NAME, dataf);
                                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                                    }
                                                );
                                            });
                                    }
                                } else {
                                    swal("فاتورة غير صحيحه");
                                    unloading("Get_Number");
                                }
                            }
                        );
                    } catch (err) {
                        unloading("Get_Number");
                        swal("فاتورة غير صحيحه");
                    }
                }
            });

        $("#last")
            .off("click")
            .on("click", () => {
                if ($('input[name="status"]:checked').val() == "offline") {
                    getData("lastInvoice").then((data) => {
                        $("#invidx").val(data.sr);
                        $("#invidx").focus();
                        data.forEach((r) => {
                            if (r.name == getpar("tbh")) {
                                showHeader(r.data[0]);
                                $(`#${getpar("tbh")} input`)[1].value = data.sr;
                            } else {
                                showSubTable(r.name, r.data);
                                SubTableFunctionalities(r.name);
                            }
                        });
                    });
                } else {
                    loading("Get_Number");
                    try {
                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cond:
                                    " Header_Number =  (select MAX(x.Header_Number) from " +
                                    getpar("tbh") +
                                    " x where x.company_id ='" +
                                    getCookie("CompId") +
                                    "' and exists( select ub.ID from  dbo.user_Branches('" +
                                    getCookie("UserID") +
                                    "') ub where ub.ID= x.branch_id and isnull(x.isDelete,0) = 0)     )",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].ID) {
                                        _repo.INVID = data[0].ID;
                                        showHeader(data[0]);
                                        _repo.children
                                            .filter(
                                                (c) =>
                                                    c.is_show == true &&
                                                    (c.type == "table" || c.type == "tableid")
                                            )
                                            .map((c) => {
                                                $.post(
                                                    "../../r/j",
                                                    {
                                                        tb: c.FKTABLE_NAME,
                                                        tbtype: "view",
                                                        cond: "Header_ID = '" + data[0].ID + "'",
                                                    },
                                                    (dataf) => {
                                                        unloading("Get_Number");

                                                        showSubTable(c.FKTABLE_NAME, dataf);
                                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                                    }
                                                );
                                            });
                                    }
                                } else {
                                    swal("فاتورة غير صحيحه");
                                    unloading("Get_Number");
                                }
                            }
                        );
                    } catch (err) {
                        unloading("Get_Number");
                        swal("فاتورة غير صحيحه");
                    }
                }
            });

        $("#back")
            .off("click")
            .on("click", () => {
                if ($('input[name="status"]:checked').val() == "offline") {
                } else {
                    loading("Get_Number");
                    try {
                        let idxVal =
                            $("#header_number_hdr").val() != ""
                                ? $("#header_number_hdr").val()
                                : "(select Min(Header_Number) + 1 from " +
                                getpar("tbh") +
                                " x where x.company_id ='" +
                                getCookie("CompId") +
                                "' and exists( select ub.ID from  dbo.user_Branches('" +
                                getCookie("UserID") +
                                "') ub where ub.ID= x.branch_id and isnull(x.isDelete,0) = 0)     )";

                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cond:
                                    "Header_Number < " +
                                    idxVal +
                                    "  and exists( select ub.ID from  dbo.user_Branches('" +
                                    getCookie("UserID") +
                                    "') ub where ub.ID= " +
                                    getpar("tbh") +
                                    ".branch_id )    ",

                                top: "1",
                                orderby: "begin_date desc",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].ID) {
                                        showHeader(data[0]);
                                        _repo.children
                                            .filter(
                                                (c) =>
                                                    c.is_show == true &&
                                                    (c.type == "table" || c.type == "tableid")
                                            )
                                            .map((c) => {
                                                $.post(
                                                    "../../r/j",
                                                    {
                                                        tb: c.FKTABLE_NAME,
                                                        tbtype: "view",
                                                        cond: "Header_ID = '" + data[0].ID + "'",
                                                    },
                                                    (dataf) => {
                                                        unloading("Get_Number");

                                                        showSubTable(c.FKTABLE_NAME, dataf);
                                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                                    }
                                                );
                                            });
                                    }
                                } else {
                                    swal("فاتورة غير صحيحه");
                                    unloading("Get_Number");
                                }
                            }
                        );
                    } catch (err) {
                        unloading("Get_Number");
                        swal("فاتورة غير صحيحه");
                    }
                }
            });

        $("#next")
            .off("click")
            .on("click", () => {
                if ($('input[name="status"]:checked').val() == "offline") {
                } else {
                    loading("Get_Number");
                    try {
                        let idxVal =
                            $("#header_number_hdr").val() != ""
                                ? $("#header_number_hdr").val()
                                : "(select Min(Header_Number) - 1 from " +
                                getpar("tbh") +
                                " x where x.company_id ='" +
                                getCookie("CompId") +
                                "' and exists( select ub.ID from  dbo.user_Branches('" +
                                getCookie("UserID") +
                                "') ub where ub.ID= x.branch_id and isnull(x.isDelete,0) = 0)     )";
                        $.post(
                            "../../r/j",
                            {
                                tb: getpar("tbh"),
                                tbtype: "tableid",
                                cond:
                                    "Header_Number > " +
                                    idxVal +
                                    "  and exists( select ub.ID from  dbo.user_Branches('" +
                                    getCookie("UserID") +
                                    "') ub where ub.ID= " +
                                    getpar("tbh") +
                                    ".branch_id )    ",
                                top: "1",
                                orderby: "begin_date asc",
                            },
                            function (data) {
                                if (data.length > 0) {
                                    if (data[0].ID) {
                                        showHeader(data[0]);
                                        _repo.children
                                            .filter(
                                                (c) =>
                                                    (c.is_show == true && c.type == "table") ||
                                                    c.type == "tableid"
                                            )
                                            .map((c) => {
                                                $.post(
                                                    "../../r/j",
                                                    {
                                                        tb: c.FKTABLE_NAME,
                                                        tbtype: "view",
                                                        cond: "Header_ID = '" + data[0].ID + "'",
                                                    },
                                                    (dataf) => {
                                                        unloading("Get_Number");

                                                        showSubTable(c.FKTABLE_NAME, dataf);
                                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                                    }
                                                );
                                            });
                                    }
                                } else {
                                    swal("فاتورة غير صحيحه");
                                    unloading("Get_Number");
                                }
                            }
                        );
                    } catch (err) {
                        unloading("Get_Number");
                        swal("فاتورة غير صحيحه");
                    }
                }
            });

        $("#" + this.elementID + "_header").text(
            this.info[getCookie("UserLang") + "_name"]
        );

        $("#invidx_lbl").append(
            getCookie("UserLang") == "ar" ? "بحث بالرقم" : "ID"
        );
        this.columns.sort((a, b) => a.sort - b.sort);

        $("#docTitle").html(
            getCookie("UserLang") == "ar" ? this.info?.ar_name : this.info?.en_name
        );
        this.#appendHeaderColumns();
    }
    #appendHeaderColumns() {
        $(`#${getpar("tbh")}`).html("");
        this.columns
            .filter(
                (c) =>
                    c.is_show == true ||
                    c.is_nullable == false ||
                    c.name?.toLowerCase() == "company_id" ||
                    c.name?.toLowerCase() == "branch_id" ||
                    c.name?.toLowerCase() == "isdelete" ||
                    c.name?.toLowerCase() == "begin_date" ||
                    c.name?.toLowerCase() == "userid"
            )
            .map((obj) => {
                if (
                    !obj.referenced_table ||
                    (obj.getCookie != "" && obj.name?.toLowerCase() !== "cost_center")
                ) {
                    // &cols=ID,account_name,tree_id,old_code,old_id,company_id,begin_date
                    let value = "";
                    if (obj.name?.toLowerCase() == "id") {
                        value = this.INVID;
                    } else if (obj.name?.toLowerCase() == "header_number") {
                        value = "0";
                    } else if (obj.getCookie !== "") {
                        value = getCookie(obj.getCookie);
                    } else if (obj.name?.toLowerCase() == "begin_date") {
                        value = new Date().toISOString().split(".")[0];
                    } else if (
                        obj.name?.toLowerCase() == "isdelete" ||
                        obj.name?.toLowerCase() == "exchange_rate"
                    ) {
                        value = "0";
                    } else if (obj.name?.toLowerCase() == "userid") {
                        value = getCookie("UserID");
                    }
                    let html = `<div class="inputgroup col-3 d-flex align-items-center gap-2 "  style='width:fit-content;${!obj.is_show ? "display:none !important;" : ""
                        }' >
                          <label for='${obj.name?.toLowerCase()}_hdr' style='font-size:15px;font-weight:500;'>${getCookie("UserLang") == "ar" ? obj.ar_name : obj.en_name
                        } :</label>
                        `;
                    html += `<input id='${obj.name?.toLowerCase()}_hdr' is_nullable=${obj.is_nullable
                        } type=${obj.html_element_type} style='width:${obj.column_width}px;${obj.readonly == true ? "background:#bcd4e0;" : ""
                        }' ${obj.readonly == true ? "readonly" : ""} data-type='${obj.fullDataType
                        }' ${value != "" ? `value='${value}'` : ""}>`;

                    html += "</div>";

                    $(`#${getpar("tbh")}`).append(html);
                    // setDefaultDateTimeInputs();

                    if (
                        obj.name?.toLowerCase() !== "id" &&
                        obj.name?.toLowerCase() !== "sr" &&
                        obj.name?.toLowerCase() !== "nots"
                    ) {
                        $(`#${obj.name?.toLowerCase()}_hdr`).on("input", () => {
                            $(`#subTables tfoot #${obj.name?.toLowerCase()}`).val(
                                $(`#${obj.name?.toLowerCase()}_hdr`).val()
                            );
                            $(`#subTables tfoot #${obj.name?.toLowerCase()}`).attr(
                                "data-id",
                                $(`#${obj.name?.toLowerCase()}_hdr`).val()
                            );
                            $(`#subTables tfoot #${obj.name?.toLowerCase()}`).attr(
                                "value",
                                $(`#${obj.name?.toLowerCase()}_hdr`).val()
                            );
                            if (
                                Array.from(
                                    document.querySelectorAll(
                                        "input#exchange_rate, #exchange_rate input"
                                    )
                                ).every((input) => input.value == "1")
                            ) {
                                $(`#subTables tr`).find(".totalFunction").hide();
                                $(`#subTables tr`).find(".exchange_rate").hide();
                                // $(".exchange_rate").hide();
                            } else {
                                $(`#subTables tr`).find(".totalFunction").show();
                                $(`#subTables tr`).find(".exchange_rate").show();
                                // $(".exchange_rate").show();
                            }
                        });
                    }
                } else {
                    if (obj.referenced_table_search == "select") {
                        $(`#${getpar("tbh")}`).append(`
                  <div style='width:fit-content;${!obj.is_show ? "display:none !important;" : ""
                            }' class="inputgroup col-3 d-flex align-items-center gap-2">
                    <label for='${obj.name?.toLowerCase()}_hdr' style='font-size:15px;font-weight:500;'>${getCookie("UserLang") == "ar" ? obj.ar_name : obj.en_name
                            } :</label>
                    <select id='${obj.name?.toLowerCase()}_hdr' style='width:${obj.column_width
                            }px' is_nullable=${obj.is_nullable} ></select>
                 <a href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${obj.referenced_table +
                            (obj.referenced_table.toLowerCase() == "account_code"
                                ? "&cols=ID,account_name,account_code,tree_id,old_id,old_code,company_id,begin_date"
                                : "")
                            }' target='_blank' style='line-height:.5;'>
                    <span class="material-symbols-outlined">add_circle</span>
                  </a>
                  </div>
                `);
                        selectj(
                            {
                                name: obj.referenced_table,
                                id: `${obj.name?.toLowerCase()}_hdr`,
                                top: "9999",
                            },
                            (data) => {
                                $(`#${obj.name?.toLowerCase()}_hdr`).prepend(
                                    `<option selected value="default">${getCookie("UserLang") == "ar" ? "اختر" : "choose"
                                    }</option>`
                                );
                                if (obj.name?.toLowerCase() == "finance_journal_type") {
                                    $(`#${obj.name?.toLowerCase()}_hdr`).html("");
                                    $(`#${obj.name?.toLowerCase()}_hdr`).prepend(
                                        `<option selected value="default">${getCookie("UserLang") == "ar" ? "اختر" : "choose"
                                        }</option>`
                                    );
                                    data.forEach((d) => {
                                        $(`#${obj.name?.toLowerCase()}_hdr`).append(
                                            `<option selected value='${d.ID}' ${obj.name?.toLowerCase() == "finance_journal_type"
                                                ? `data-docRelated='${d.document_related_name}'`
                                                : ""
                                            }>${d.name}</option>`
                                        );
                                    });
                                }
                                if (obj.getCookie != "") {
                                    if (getCookie(obj.getCookie) != "") {
                                        $(`#${obj.name?.toLowerCase()}_hdr`).val(
                                            getCookie(obj.getCookie)
                                        );
                                    }
                                }
                                if (obj.name?.toLowerCase() == "shift_number") {
                                    $(`#${obj.name?.toLowerCase()}_hdr`).val(
                                        $(`#${obj.name?.toLowerCase()}_hdr option:last-child`).val()
                                    );
                                }
                                if (obj.name?.toLowerCase() == "currency_name") {
                                    $('#currency_name_hdr option:contains("EGP")').attr(
                                        "selected",
                                        "selected"
                                    );
                                    $(`#exchange_rate_hdr`).val(1);
                                    $("#exchange_rate_hdr")
                                        .closest(".inputgroup")
                                        .attr("style", "width:fit-content;display:none !important");
                                    $(`#subTables tfoot #exchange_rate`).val(
                                        $(`#exchange_rate_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_id`).val(
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_name`).val(
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_name`).attr(
                                        "value",
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_id`).attr(
                                        "value",
                                        $(`#currency_name_hdr`).val()
                                    );
                                }
                            }
                        );
                        $(`#${obj.name?.toLowerCase()}_hdr`).on("change", (e) => {
                            if (obj.name?.toLowerCase() == "finance_journal_type") {
                                if (
                                    $(`#${obj.name?.toLowerCase()}_hdr`)
                                        .find("option:selected")
                                        .attr("data-docRelated") == "null"
                                ) {
                                    $("#relateddoc_hdr")
                                        .closest("div")
                                        .find("label")
                                        .text("رقم مستند مرتبط :");
                                } else {
                                    $("#relateddoc_hdr")
                                        .closest("div")
                                        .find("label")
                                        .text(
                                            $(`#${obj.name?.toLowerCase()}_hdr`)
                                                .find("option:selected")
                                                .attr("data-docRelated") + " :"
                                        );
                                }
                            } else if (obj.name?.toLowerCase() == "currency_name") {
                                if (
                                    $(`#${obj.name?.toLowerCase()}_hdr`)
                                        .find("option:selected")
                                        .text()
                                        .toLowerCase() == "egp"
                                ) {
                                    $("#exchange_rate_hdr").val(1);
                                    $("#exchange_rate_hdr")
                                        .closest(".inputgroup")
                                        .attr("style", "width:fit-content;display:none !important");
                                    $(`#subTables tfoot #exchange_rate`).val(
                                        $(`#exchange_rate_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_id`).val(
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_id`).attr(
                                        "value",
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_name`).val(
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #currency_name`).attr(
                                        "value",
                                        $(`#currency_name_hdr`).val()
                                    );
                                    $(`#subTables tfoot #exchange_rate`).attr(
                                        "value",
                                        $(`#exchange_rate_hdr`).val()
                                    );
                                    if (
                                        Array.from(
                                            document.querySelectorAll(
                                                "input#exchange_rate, #exchange_rate input"
                                            )
                                        ).every((input) => input.value == "1")
                                    ) {
                                        $(`#subTables tr`).find(".totalFunction").hide();
                                        $(`#subTables tr`).find(".exchange_rate").hide();
                                        //  $(".exchange_rate").hide();
                                    } else {
                                        $(`#subTables tr`).find(".totalFunction").show();
                                        $(`#subTables tr`).find(".exchange_rate").show();
                                        //  $(".exchange_rate").show();
                                    }
                                } else {
                                    $.post(
                                        "../../r/j",
                                        {
                                            tb: "Currency_Company",
                                            tbtype: "tableid",
                                            cols: "Open_balance_exchange_rate",
                                            cond: "ID = '" + $(e.target).val() + "'",
                                        },
                                        function (data) {
                                            if (data[0].Open_balance_exchange_rate) {
                                                $("#exchange_rate_hdr").val(
                                                    data[0].Open_balance_exchange_rate
                                                );
                                                $("#exchange_rate_hdr")
                                                    .closest(".inputgroup")
                                                    .attr("style", "width:fit-content;");
                                                $(`#subTables tfoot #exchange_rate`).val(
                                                    $(`#exchange_rate_hdr`).val()
                                                );
                                                $(`#subTables tfoot #currency_id`).val(
                                                    $(`#currency_name_hdr`).val()
                                                );
                                                $(`#subTables tfoot #currency_id`).attr(
                                                    "value",
                                                    $(`#currency_name_hdr`).val()
                                                );
                                                $(`#subTables tfoot #exchange_rate`).attr(
                                                    "value",
                                                    $(`#exchange_rate_hdr`).val()
                                                );
                                            }
                                            if (
                                                Array.from(
                                                    document.querySelectorAll(
                                                        "input#exchange_rate, #exchange_rate input"
                                                    )
                                                ).every((input) => input.value == "1")
                                            ) {
                                                $(`#subTables tr`).find(".totalFunction").hide();
                                                $(`#subTables tr`).find(".exchange_rate").hide();
                                                // $(".exchange_rate").hide();
                                            } else {
                                                $(`#subTables tr`).find(".totalFunction").show();
                                                $(`#subTables tr`).find(".exchange_rate").show();
                                                // $(".exchange_rate").show();
                                            }
                                        }
                                    );
                                }
                            }
                            if (
                                $(`#subTables #${obj.name?.toLowerCase()}`)
                                    .closest("td")
                                    .css("display") == "none"
                            ) {
                                $(`#subTables tfoot #${obj.name?.toLowerCase()}`).val(
                                    $(`#${obj.name?.toLowerCase()}_hdr`).val()
                                );
                                $(`#subTables tfoot #${obj.name?.toLowerCase()}`).attr(
                                    "data-id",
                                    $(`#${obj.name?.toLowerCase()}_hdr`).val()
                                );
                                $(`#subTables tfoot #${obj.name?.toLowerCase()}`).attr(
                                    "value",
                                    $(`#${obj.name?.toLowerCase()}_hdr`).val()
                                );
                            }
                        });
                    } else if (obj.referenced_table_search == "autocomplete") {
                        $(`#${getpar("tbh")}`).append(`
                  <div class="inputgroup col-3 d-flex align-items-center gap-2"  style='${!obj.is_show
                                ? "display:none !important;position:relative;"
                                : "position:relative;"
                            }' >
                    <label for='${obj.name?.toLowerCase()}_hdr' style='font-size:15px;font-weight:500;'>${getCookie("UserLang") == "ar" ? obj.ar_name : obj.en_name
                            } :</label>
                    <input id='${obj.name?.toLowerCase()}_hdr' autocomplete="off" is_nullable=${obj.is_nullable
                            } type='text' style='width:${obj.column_width}px' >
                                 <div style='display: flex;flex-direction: column;gap: 2px;'>
                     <a href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${obj.referenced_table +
                            (obj.referenced_table.toLowerCase() == "account_code"
                                ? "&cols=ID,account_name,account_code,tree_id,old_id,old_code,company_id,begin_date"
                                : "")
                            }' target='_blank' style='line-height:.5;'>
                    <span style='font-weight:500;font-size:20px;' class="material-symbols-outlined">add_circle</span>
                  </a>
                  <span data-referenced_table='${obj.referenced_table
                            }' data-referenced_mainCol='${obj.name
                            }' data-referenced_columns='${obj.referenced_columns
                            }' style='font-weight:600;color:white;font-size:18px;display:block;cursor:pointer;' class="material-symbols-outlined reloadElement">replay</span>
                  </div>
                  </div>
                `);

                        $(`#${getpar("tbh")} .reloadElement`)
                            .off("click")
                            .on("click", (e) => {
                                console.log(
                                    "kalo",
                                    $(e.currentTarget).attr("data-referenced_table")
                                );
                                getjdata(
                                    {
                                        name: $(e.currentTarget).attr("data-referenced_table"),
                                        top: "9999",
                                    },
                                    (data) => {
                                        references_tb.push({
                                            referenced_table: $(e.currentTarget).attr(
                                                "data-referenced_table"
                                            ),
                                            referenced_mainCol: $(e.currentTarget).attr(
                                                "data-referenced_mainCol"
                                            ),
                                            referenced_columns: $(e.currentTarget).attr(
                                                "data-referenced_columns"
                                            ),
                                            referenced_data: data,
                                        });
                                        console.log("refeefer", references_tb);
                                        let suggestions = [];
                                        data.forEach((d) => {
                                            suggestions.push({
                                                ID: d["ID"],
                                                values: $(e.currentTarget)
                                                    .attr("data-referenced_columns")
                                                    .split(",")
                                                    .map((c) => d[c]),
                                                headers: $(e.currentTarget)
                                                    .attr("data-referenced_columns")
                                                    .split(",")
                                                    .map((c) => c),
                                            });
                                        });
                                        autocomplete(
                                            $(e.currentTarget)
                                                .attr("data-referenced_mainCol")
                                                .toLowerCase(),
                                            suggestions
                                        );
                                        setTimeout(() => {
                                            if (
                                                $(
                                                    `#${$(e.currentTarget)
                                                        .attr("data-referenced_mainCol")
                                                        ?.toLowerCase()}_hdr`
                                                ).length > 0
                                            ) {
                                                let value =
                                                    $(
                                                        `#${$(e.currentTarget)
                                                            .attr("data-referenced_mainCol")
                                                            ?.toLowerCase()}_hdr`
                                                    ).attr("data-id") == "" ||
                                                        $(
                                                            `#${$(e.currentTarget)
                                                                .attr("data-referenced_mainCol")
                                                                ?.toLowerCase()}_hdr`
                                                        ).attr("data-id") == undefined
                                                        ? $(
                                                            `#${$(e.currentTarget)
                                                                .attr("data-referenced_mainCol")
                                                                ?.toLowerCase()}_hdr`
                                                        ).val()
                                                        : $(
                                                            `#${$(e.currentTarget)
                                                                .attr("data-referenced_mainCol")
                                                                ?.toLowerCase()}_hdr`
                                                        ).attr("data-id");
                                                let selected = suggestions.filter((s) => s.ID == value);
                                                $(
                                                    `#${$(e.currentTarget)
                                                        .attr("data-referenced_mainCol")
                                                        .toLowerCase()}`
                                                ).val(selected[0]?.values[0]);
                                                $(
                                                    `#${$(e.currentTarget)
                                                        .attr("data-referenced_mainCol")
                                                        .toLowerCase()}`
                                                ).attr("data-id", selected[0]?.ID);
                                            }
                                        }, 0);
                                    }
                                );
                            });

                        getjdata(
                            {
                                name: obj.referenced_table,
                                top: "9999",
                            },
                            (data) => {
                                references_tb.push({
                                    referenced_table: obj.referenced_table,
                                    referenced_mainCol: obj.name,
                                    referenced_columns: obj.referenced_columns,
                                    referenced_data: data,
                                });
                                let suggestions = [];
                                data.forEach((d) => {
                                    suggestions.push({
                                        ID: d["ID"],
                                        values: obj.referenced_columns.split(",").map((c) => d[c]),
                                        headers: obj.referenced_columns.split(",").map((c) => c),
                                    });
                                });
                                autocomplete(obj.name?.toLowerCase() + "_hdr", suggestions);
                                if (obj.getCookie != "") {
                                    if (getCookie(obj.getCookie) != "") {
                                        $(`#${obj.name?.toLowerCase()}_hdr`).attr(
                                            "data-id",
                                            getCookie(obj.getCookie)
                                        );
                                        $(`#${obj.name?.toLowerCase()}_hdr`).val(
                                            suggestions.filter(
                                                (s) => s.ID == getCookie(obj.getCookie)
                                            )[0].values[0]
                                        );
                                    }
                                }
                            }
                        );
                    } else {
                    }
                }
            });
    }

    #appendSubTables() {
        this.children
            ?.sort((a, b) => a.sort - b.sort)
            .map(async (c) => {
                if (c.is_show) {
                    if (c.type == "table" || c.type == "tableid") {
                        let data_array = await getPureJson(
                            postSync("../../api/v1/data", {
                                name: "structure_info",
                                parameters: JSON.stringify([
                                    { name: "@tbh", value: c.FKTABLE_NAME, type: "nvarchar" },
                                    {
                                        name: "@compid",
                                        value: getCookie("CompId"),
                                        type: "nvarchar",
                                    },
                                ]),
                            })
                        );
                        let datad = data_array[0];
                        // ... inside #appendSubTables method
                        const filteredInfo = datad.object_info.filter(
                            (obj) =>
                                obj.table_name?.toLowerCase() ==
                                c.FKTABLE_NAME?.toLowerCase() && obj
                        );

                        // Check if a match was found
                        if (filteredInfo.length === 0) {
                            console.error("No object_info found for table:", c.FKTABLE_NAME);
                            return; // Skip this iteration of the map to prevent crashing
                        }

                        let objectInfoDtl = filteredInfo[0]; // Now it's safe to access the first element
                        console.log("datad", datad, c.FKTABLE_NAME);
                        let dcolumns = datad.columns_info;
                        // ... rest of the function continues as normal

                        $("#subTables").html("");
                        thdname = c.FKTABLE_NAME
                        $("#subTables").append(`<section id='${c.FKTABLE_NAME
                            }' style='max-width: 100%;margin-bottom: 125px;' class='row'><div class="d-flex align-items-center gap-3 justify-content-center mt-5 mb-4">
  <i class="ace-icon fa fa-leaf green"></i> <h4 id="${this.elementID
                            }_details" class="text-center mb-3">${getCookie("UserLang") == "ar"
                                ? `${objectInfoDtl["ar_name"]}`
                                : `${objectInfoDtl["en_name"]}`
                            }</h4>
  </div><table style='border-radius:6px;'><thead><tr><th style='text-align: center;width:15px;'>#</th></tr></thead><tbody></tbody><tfoot><tr><td style='text-align: center;'>-</td></tr><tr><td style='text-align: center;'>-</td></tr></tfoot></table></section>`);

                        dcolumns
                            ?.filter(
                                (c) =>
                                    c.is_show == true ||
                                    c.is_nullable == false ||
                                    c.name?.toLowerCase() == "company_id" ||
                                    c.name?.toLowerCase() == "branch_id" ||
                                    c.name?.toLowerCase() == "isdelete" ||
                                    c.name?.toLowerCase() == "userid" ||
                                    c.name?.toLowerCase() == "begin_date" ||
                                    $(
                                        `#${getpar(
                                            "tbh"
                                        ).toLowerCase()} #${c.name?.toLowerCase()}_hdr`
                                    ).length > 0
                            )
                            .map((obj) => {
                                if (obj.name?.toLowerCase() == "account_code") {
                                    $(`#${c.FKTABLE_NAME} thead tr`).append(
                                        `<th style='${!obj.is_show ? "display:none;" : ""
                                        }'>الحساب الرئيسي</th><th style='${!obj.is_show ? "display:none;width:50px;" : "width:50px;"
                                        }'>كود الحساب</th><th class='${obj.name?.toLowerCase()}' style='${!obj.is_show || obj.name == "UserID" ? "display:none" : ""
                                        }'>${obj[getCookie("UserLang") + "_name"]} ${!obj.is_nullable
                                            ? "<span style='color:#F44336;font-size:20px;'>*</span>"
                                            : ""
                                        }</th>`
                                    );
                                    $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(1)`).append(
                                        `<td style='${!obj.is_show
                                            ? "display:none;text-align: center;"
                                            : "text-align: center;"
                                        }'>-</td><td style='${!obj.is_show
                                            ? "display:none;text-align: center;"
                                            : "text-align: center;"
                                        }'>-</td><td class='${obj.name?.toLowerCase()}' style='${!obj.is_show || obj.name == "UserID"
                                            ? "display:none;text-align: center;"
                                            : "text-align: center;"
                                        }'>-</td>`
                                    );
                                } else {
                                    $(`#${c.FKTABLE_NAME} thead tr`).append(
                                        `<th class='${obj.name?.toLowerCase()}' style='${!obj.is_show || obj.name == "UserID" ? "display:none" : ""
                                        }'>${obj[getCookie("UserLang") + "_name"]} ${!obj.is_nullable
                                            ? "<span style='color:#F44336;font-size:20px;'>*</span>"
                                            : ""
                                        }</th>`
                                    );
                                    $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(1)`).append(
                                        `<td class='${obj.name?.toLowerCase()}' style='${!obj.is_show || obj.name == "UserID"
                                            ? "display:none;text-align: center;"
                                            : "text-align: center;"
                                        }'>-</td>`
                                    );
                                }
                                if (
                                    !obj.referenced_table ||
                                    obj.referenced_table?.toLowerCase() ==
                                    getpar("tbh").toLowerCase() ||
                                    obj.name?.toLowerCase() == "company_id" ||
                                    ($(
                                        `#${getpar("tbh").toLowerCase()} #${obj.name}_hdr`.length >
                                        0
                                    ) &&
                                        !obj.is_show)
                                ) {
                                    let value = "";
                                    if (
                                        obj.referenced_table?.toLowerCase() ==
                                        getpar("tbh").toLowerCase()
                                    ) {
                                        value = this.INVID;
                                    } else if (obj.getCookie != "") {
                                        value = getCookie(obj.getCookie);
                                    } else if (obj.name?.toLowerCase() == "sr") {
                                        value =
                                            Number(
                                                $('input[data-colname="sr"]:eq(-2)').length > 0
                                                    ? $('input[data-colname="sr"]:eq(-2)').val()
                                                    : 0
                                            ) + 1;
                                    } else if (obj.name?.toLowerCase() == "begin_date") {
                                        value = new Date().toISOString().split(".")[0];
                                    } else if (obj.name?.toLowerCase() == "userid") {
                                        value = getCookie("UserID");
                                    } else if (obj.name?.toLowerCase() == "currency_id") {
                                        value = $("#currency_name_hdr").val();
                                    } else if (obj.name?.toLowerCase() == "nots") {
                                        value = "-";
                                    }
                                    if (
                                        $(`#${obj.name?.toLowerCase()}_hdr`).length > 0 &&
                                        obj.name?.toLowerCase() !== "id" &&
                                        obj.name?.toLowerCase() !== "nots" &&
                                        obj.name?.toLowerCase() !== "sr"
                                    ) {
                                        value =
                                            $(`#${obj.name?.toLowerCase()}_hdr`).attr("data-id") ==
                                                "" ||
                                                $(`#${obj.name?.toLowerCase()}_hdr`).attr("data-id") ==
                                                undefined
                                                ? $(`#${obj.name?.toLowerCase()}_hdr`).val()
                                                : $(`#${obj.name?.toLowerCase()}_hdr`).attr("data-id");
                                    }
                                    if (obj.type == "bit" && (value == "0" || value == 0)) {
                                        value = "false";
                                    }
                                    let html = `<td class='${obj.name?.toLowerCase()}' style='${!obj.is_show
                                        ? `display:none;width:${obj.column_width}px`
                                        : `width:${obj.column_width}px;`
                                        }'>
                        `;
                                    html += `<input id='${obj.name?.toLowerCase()}' ${obj.referenced_table
                                        ? `data-reference='${obj.referenced_table.toLowerCase()}'`
                                        : ""
                                        } data-colname='${obj.name}' function_name='${obj.function_name
                                        }' is_show='${obj.is_show ? "true" : "false"}' is_nullable=${obj.is_nullable
                                        } type='${obj.html_element_type}' ${obj.readonly ? "readonly" : ""
                                        } data-type='${obj.fullDataType}' value='${obj.html_element_type == "number" &&
                                            obj.name?.toLowerCase() != "sr" &&
                                            obj.name?.toLowerCase() != "exchange_rate"
                                            ? " "
                                            : value
                                        }' style='${obj.readonly ? "background:#bcd4e0;" : ""}'>`;
                                    html += "</td>";
                                    $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2)`).append(html);
                                    setDefaultDateTimeInputs();
                                } else {
                                    if (obj.referenced_table_search == "select") {
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2)`).append(`
                  <td class='${obj.name?.toLowerCase()}' style='${!obj.is_show
                                                ? `display:none;width:${obj.column_width}px`
                                                : `width:${obj.column_width}px;`
                                            }'>
                  <div style='display:flex;align-items:center;gap:2px;'>
                    <select id='${obj.name}' data-colname='${obj.name
                                            }' data-type='${obj.fullDataType}'  referenced_table='${obj.referenced_table
                                            }' is_nullable=${obj.is_nullable} style='width:${obj.column_width
                                            }px' ${obj.readonly ? "readonly" : ""}></select>
                    <a style='display:${obj.readonly ? "none" : "inline-block"
                                            };line-height:.5;' href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${obj.referenced_table +
                                            (obj.referenced_table.toLowerCase() == "account_code"
                                                ? "&cols=ID,account_name,account_code,tree_id,old_id,old_code,company_id,begin_date"
                                                : "")
                                            }' target='_blank'>
                    <span class="material-symbols-outlined">add_circle</span>
                  </a>
                  </div>
                  </td>
                `);
                                        selectj(
                                            {
                                                name: obj.referenced_table,
                                                id: obj.name,
                                                typeselect: "select2",
                                                top: "9999",
                                            },
                                            (data) => {
                                                references_tb.push({
                                                    referenced_table: obj.referenced_table,
                                                    referenced_mainCol: obj.name,
                                                    referenced_columns: obj.referenced_columns,
                                                    referenced_data: data,
                                                });
                                                $(`#${obj.name}`).prepend(
                                                    `<option selected value="default">${getCookie("UserLang") == "ar" ? "اختر" : "choose"
                                                    }</option>`
                                                );
                                            }
                                        );
                                    } else if (obj.referenced_table_search == "autocomplete") {
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2)`).append(`
                      ${obj.name?.toLowerCase() == "account_code"
                                                ? `<td class='nodata' style='${!obj.is_show
                                                    ? `display:none;position:relative;width:${obj.column_width}px`
                                                    : `position:relative;width:${obj.column_width}px`
                                                }'>
                     <div class='visual' style='display:flex;align-items:center;gap:2px;'>
                    <input class='autocomplete' id='account_treeF' data-colname='Tree_id' type='text'>
                     <div style='display: flex;flex-direction: column;gap: 2px;'>
                     <a style='display:${obj.readonly ? "none" : "inline-block"
                                                };line-height:.5;' href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=Account_tree' target='_blank'>
                          <span style='font-weight:500;font-size:20px;' class="material-symbols-outlined">add_circle</span>
                  </a>
                  <span data-referenced_table='Account_tree' data-referenced_mainCol='account_tree' data-referenced_columns='Account_name,Account_Code' style='font-weight:600;color:white;font-size:18px;display:block;cursor:pointer;' class="material-symbols-outlined reloadElement">replay</span>
                  </div>
                  </div>
                  </td>
                          <td id='account_oldCode'><span style='color:black;background:#bcd4e0;display:flex;padding: 4px 6px;border-radius: 6px;height:30px;'></span></td>`
                                                : ""
                                            } <td class='${obj.name}' style='${!obj.is_show
                                                ? `display:none;position:relative;width:${obj.column_width}px`
                                                : `position:relative;width:${obj.column_width}px`
                                            }'>
                     <div style='display:flex;align-items:center;gap:2px;'>
                    <input class='autocomplete' autocomplete="off" data-colname='${obj.name
                                            }' id='${obj.name.toLowerCase()}' data-readonly='${obj.readonly ? "true" : ""
                                            }' type='text' is_nullable=${obj.is_nullable} data-type='${obj.fullDataType
                                            }'>
                    <div style='display: flex;flex-direction: column;gap: 2px;'>
                     <a style='display:${obj.readonly ? "none" : "inline-block"
                                            };line-height:.5;' href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${obj.referenced_table +
                                            (obj.referenced_table.toLowerCase() == "account_code"
                                                ? "&cols=ID,account_name,account_code,tree_id,old_id,old_code,company_id,begin_date"
                                                : "")
                                            }' target='_blank'>
                    <span style='font-weight:500;font-size:20px;' class="material-symbols-outlined">add_circle</span>
                  </a>
                  <span data-referenced_table='${obj.referenced_table
                                            }' data-referenced_mainCol='${obj.name
                                            }' data-referenced_columns='${obj.referenced_columns
                                            }' style='font-weight:600;color:white;font-size:18px;display:block;cursor:pointer;' class="material-symbols-outlined reloadElement">replay</span>
                  </div>
                  </td>
                `);
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) .reloadElement`)
                                            .off("click")
                                            .on("click", (e) => {
                                                loading("refreshing");
                                                if (
                                                    $(e.currentTarget)
                                                        .attr("data-referenced_table")
                                                        ?.toLowerCase() == "account_code"
                                                ) {
                                                    getjdata(
                                                        {
                                                            name: "Account_tree",
                                                            top: "9999",
                                                        },
                                                        (data) => {
                                                            references_tb.push({
                                                                referenced_table: "Account_tree",
                                                                referenced_mainCol: "account_tree",
                                                                referenced_columns: "Account_name,Account_Code",
                                                                referenced_data: data,
                                                            });
                                                            let suggestions = [];
                                                            data.forEach((d) => {
                                                                suggestions.push({
                                                                    ID: d["ID"],
                                                                    values: "Account_name,Account_Code"
                                                                        .split(",")
                                                                        .map((c) => d[c]),
                                                                    headers: "Account_name,Account_Code"
                                                                        .split(",")
                                                                        .map((c) => c),
                                                                });
                                                            });
                                                            autocomplete("account_treeF", suggestions);
                                                            setTimeout(() => {
                                                                const observer = new MutationObserver(
                                                                    (mutationsList) => {
                                                                        mutationsList.forEach((mutation) => {
                                                                            if (
                                                                                mutation.attributeName === "data-id"
                                                                            ) {
                                                                                let refTb = references_tb?.filter(
                                                                                    (r) =>
                                                                                        r.referenced_mainCol ==
                                                                                        $(e.currentTarget).attr(
                                                                                            "data-referenced_table"
                                                                                        )
                                                                                )[0];
                                                                                let suggestions = [];
                                                                                let filteredSug =
                                                                                    refTb.referenced_data.filter(
                                                                                        (d) =>
                                                                                            d.Tree_ID ==
                                                                                            $("#account_treeF").val() ||
                                                                                            $("#account_treeF")
                                                                                                .val()
                                                                                                .trim() == ""
                                                                                    );
                                                                                filteredSug.forEach((d) => {
                                                                                    suggestions.push({
                                                                                        ID: d["ID"],
                                                                                        values: refTb.referenced_columns
                                                                                            .split(",")
                                                                                            .map((c) => d[c]),
                                                                                        headers: refTb.referenced_columns
                                                                                            .split(",")
                                                                                            .map((c) => c),
                                                                                    });
                                                                                });
                                                                                autocomplete(
                                                                                    $(e.currentTarget)
                                                                                        .attr("data-referenced_table")
                                                                                        .toLowerCase(),
                                                                                    suggestions
                                                                                );
                                                                            }
                                                                        });
                                                                    }
                                                                );
                                                                observer.observe(
                                                                    document.getElementById("account_treeF"),
                                                                    { attributes: true }
                                                                );
                                                            }, 0);
                                                        }
                                                    );
                                                }
                                                getjdata(
                                                    {
                                                        name: $(e.currentTarget).attr(
                                                            "data-referenced_table"
                                                        ),
                                                        top: "9999",
                                                    },
                                                    (data) => {
                                                        unloading("refreshing");

                                                        references_tb.push({
                                                            referenced_table: $(e.currentTarget).attr(
                                                                "data-referenced_table"
                                                            ),
                                                            referenced_mainCol: $(e.currentTarget).attr(
                                                                "data-referenced_mainCol"
                                                            ),
                                                            referenced_columns: $(e.currentTarget).attr(
                                                                "data-referenced_columns"
                                                            ),
                                                            referenced_data: data,
                                                        });
                                                        console.log("refeefer", references_tb);
                                                        let suggestions = [];
                                                        data.forEach((d) => {
                                                            suggestions.push({
                                                                ID: d["ID"],
                                                                values: $(e.currentTarget)
                                                                    .attr("data-referenced_columns")
                                                                    .split(",")
                                                                    .map((c) => d[c]),
                                                                headers: $(e.currentTarget)
                                                                    .attr("data-referenced_columns")
                                                                    .split(",")
                                                                    .map((c) => c),
                                                            });
                                                        });
                                                        autocomplete(
                                                            $(e.currentTarget)
                                                                .attr("data-referenced_mainCol")
                                                                .toLowerCase(),
                                                            suggestions
                                                        );
                                                        setTimeout(() => {
                                                            if (
                                                                $(
                                                                    `#${$(e.currentTarget)
                                                                        .attr("data-referenced_mainCol")
                                                                        ?.toLowerCase()}_hdr`
                                                                ).length > 0
                                                            ) {
                                                                let value =
                                                                    $(
                                                                        `#${$(e.currentTarget)
                                                                            .attr("data-referenced_mainCol")
                                                                            ?.toLowerCase()}_hdr`
                                                                    ).attr("data-id") == "" ||
                                                                        $(
                                                                            `#${$(e.currentTarget)
                                                                                .attr("data-referenced_mainCol")
                                                                                ?.toLowerCase()}_hdr`
                                                                        ).attr("data-id") == undefined
                                                                        ? $(
                                                                            `#${$(e.currentTarget)
                                                                                .attr("data-referenced_mainCol")
                                                                                ?.toLowerCase()}_hdr`
                                                                        ).val()
                                                                        : $(
                                                                            `#${$(e.currentTarget)
                                                                                .attr("data-referenced_mainCol")
                                                                                ?.toLowerCase()}_hdr`
                                                                        ).attr("data-id");
                                                                let selected = suggestions.filter(
                                                                    (s) => s.ID == value
                                                                );
                                                                $(
                                                                    `#${$(e.currentTarget)
                                                                        .attr("data-referenced_mainCol")
                                                                        .toLowerCase()}`
                                                                ).val(selected[0]?.values[0]);
                                                                $(
                                                                    `#${$(e.currentTarget)
                                                                        .attr("data-referenced_mainCol")
                                                                        .toLowerCase()}`
                                                                ).attr("data-id", selected[0]?.ID);
                                                            }
                                                        }, 0);
                                                    }
                                                );
                                            });
                                        if (obj.name?.toLowerCase() == "account_code") {
                                            getjdata(
                                                {
                                                    name: "Account_tree",
                                                    top: "9999",
                                                },
                                                (data) => {
                                                    references_tb.push({
                                                        referenced_table: "Account_tree",
                                                        referenced_mainCol: "account_tree",
                                                        referenced_columns: "Account_name,Account_Code",
                                                        referenced_data: data,
                                                    });
                                                    let suggestions = [];
                                                    data.forEach((d) => {
                                                        suggestions.push({
                                                            ID: d["ID"],
                                                            values: "Account_name,Account_Code"
                                                                .split(",")
                                                                .map((c) => d[c]),
                                                            headers: "Account_name,Account_Code"
                                                                .split(",")
                                                                .map((c) => c),
                                                        });
                                                    });
                                                    autocomplete("account_treeF", suggestions);
                                                    setTimeout(() => {
                                                        const observer = new MutationObserver(
                                                            (mutationsList) => {
                                                                mutationsList.forEach((mutation) => {
                                                                    if (mutation.attributeName === "data-id") {
                                                                        let refTb = references_tb?.filter(
                                                                            (r) => r.referenced_mainCol == obj.name
                                                                        )[0];
                                                                        let suggestions = [];
                                                                        let filteredSug =
                                                                            refTb.referenced_data.filter(
                                                                                (d) =>
                                                                                    d.Tree_ID ==
                                                                                    $("#account_treeF").val() ||
                                                                                    $("#account_treeF").val().trim() == ""
                                                                            );
                                                                        filteredSug.forEach((d) => {
                                                                            suggestions.push({
                                                                                ID: d["ID"],
                                                                                values: refTb.referenced_columns
                                                                                    .split(",")
                                                                                    .map((c) => d[c]),
                                                                                headers: refTb.referenced_columns
                                                                                    .split(",")
                                                                                    .map((c) => c),
                                                                            });
                                                                        });
                                                                        autocomplete(
                                                                            obj.name.toLowerCase(),
                                                                            suggestions
                                                                        );
                                                                    }
                                                                });
                                                            }
                                                        );
                                                        observer.observe(
                                                            document.getElementById("account_treeF"),
                                                            { attributes: true }
                                                        );
                                                    }, 0);
                                                }
                                            );
                                        }
                                        getjdata(
                                            {
                                                name: obj.referenced_table,
                                                top: "9999",
                                            },
                                            (data) => {
                                                references_tb.push({
                                                    referenced_table: obj.referenced_table,
                                                    referenced_mainCol: obj.name,
                                                    referenced_columns: obj.referenced_columns,
                                                    referenced_data: data,
                                                });
                                                console.log("refeefer", references_tb);
                                                let suggestions = [];
                                                data.forEach((d) => {
                                                    suggestions.push({
                                                        ID: d["ID"],
                                                        values: obj.referenced_columns
                                                            .split(",")
                                                            .map((c) => d[c]),
                                                        headers: obj.referenced_columns
                                                            .split(",")
                                                            .map((c) => c),
                                                    });
                                                });
                                                autocomplete(obj.name.toLowerCase(), suggestions);
                                                setTimeout(() => {
                                                    if ($(`#${obj.name?.toLowerCase()}_hdr`).length > 0) {
                                                        let value =
                                                            $(`#${obj.name?.toLowerCase()}_hdr`).attr(
                                                                "data-id"
                                                            ) == "" ||
                                                                $(`#${obj.name?.toLowerCase()}_hdr`).attr(
                                                                    "data-id"
                                                                ) == undefined
                                                                ? $(`#${obj.name?.toLowerCase()}_hdr`).val()
                                                                : $(`#${obj.name?.toLowerCase()}_hdr`).attr(
                                                                    "data-id"
                                                                );
                                                        let selected = suggestions.filter(
                                                            (s) => s.ID == value
                                                        );
                                                        $(`#${obj.name.toLowerCase()}`).val(
                                                            selected[0]?.values[0]
                                                        );
                                                        $(`#${obj.name.toLowerCase()}`).attr(
                                                            "data-id",
                                                            selected[0]?.ID
                                                        );
                                                    }
                                                }, 0);
                                            }
                                        );
                                    } else if (obj.referenced_table_search == "search_input") {
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2)`).append(`
                  <td class='${obj.name?.toLowerCase()}' style='${!obj.is_show
                                                ? `display:none;position:relative;width:${obj.column_width}px`
                                                : `position:relative;width:${obj.column_width}px`
                                            }'>
                     <div style='display:flex;align-items:center;gap:2px;'>
                    <input class='autocomplete' id='${obj.name
                                            }' data-readonly='${obj.readonly ? "true" : ""
                                            }' type='text' is_nullable=${obj.is_nullable} data-type='${obj.fullDataType
                                            }'>
                     <a style='display:${obj.readonly ? "none" : "inline-block"
                                            };line-height:.5;' href='../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=${obj.referenced_table +
                                            (obj.referenced_table.toLowerCase() == "account_code"
                                                ? "&cols=ID,account_name,account_code,tree_id,old_id,old_code,company_id,begin_date"
                                                : "")
                                            }' target='_blank'>
                    <span class="material-symbols-outlined">add_circle</span>
                  </a>
                  </div>
                  </td>
                `);
                                        searchj({
                                            inputid: obj.name,
                                            name: obj.referenced_table,
                                            cols: "ID," + obj.referenced_columns,
                                            isunique: 0,
                                            filed: "name+isnull(code,'')",
                                            help: "1",
                                        });
                                    }
                                }
                            });
                        if (c.total_function && c.total_function !== "") {
                            $(`#${c.FKTABLE_NAME} thead tr`).append(
                                `<th class='totalFunction' style='width:100px;'> ${getCookie("UserLang") == "ar" ? "القيمة" : "Total"
                                }</th>`
                            );
                            $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(1)`).append(
                                `<td class='totalFunction' id="${c.FKTABLE_NAME}_totalFunction" data-totalFunction='${c.total_function}' style="text-align: center;">-</td>`
                            );
                            $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2)`).append(
                                `<td class='totalFunction'  style="text-align: center;">-</td>`
                            );
                        }
                        setTimeout(() => {
                            if (
                                Array.from(
                                    document.querySelectorAll(
                                        "input#exchange_rate, #exchange_rate input"
                                    )
                                ).every((input) => input.value == "1")
                            ) {
                                $(`#${c.FKTABLE_NAME} tr`).find(".totalFunction").hide();
                                $(`#${c.FKTABLE_NAME} tr`).find(".exchange_rate").hide();
                                //  $(".exchange_rate").hide();
                            } else {
                                $(`#${c.FKTABLE_NAME} tr`).find(".totalFunction").show();
                                $(`#${c.FKTABLE_NAME} tr`).find(".exchange_rate").show();
                                //  $(".exchange_rate").show();
                            }
                        }, 0);
                        subTableInputsChange(c.FKTABLE_NAME);
                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td *`).on(
                            "keypress",
                            function (e) {
                                if (e.which == 13) {
                                    let trIdx = $(
                                        `#${c.FKTABLE_NAME} tbody tr:not([style*="display: none;"])`
                                    ).length;
                                    $(`#${c.FKTABLE_NAME} tfoot #id`).val(uuidv4());
                                    let elements = document.querySelectorAll(
                                        `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td > input, #${c.FKTABLE_NAME} tfoot tr:nth-child(2) td div > *:not(span):not(a):not(ul):not(div)`
                                    );
                                    let message = "يجب ملأ جميع البيانات";
                                    let notValid = [...elements].some(
                                        (i) =>
                                            $(i).attr("is_nullable") == "false" &&
                                            ($(i).val() == "" || $(i).val() == "default") &&
                                            $(i).closest("td").css("display") != "none"
                                    );
                                    if (notValid == false) {
                                        let html = `<tr><td class='nodata' style='align-items: center;justify-content: space-evenly;'><i class='deleteSubTrNewAdd material-icons py-2' style='cursor:pointer;color:#f44336;'>delete</i></td>`;
                                        elements.forEach((i, idx) => {
                                            if (i.localName == "select") {
                                                $(i).val($(i).find(" option:selected").val());
                                                html += `<td id='${$(i)
                                                    .attr("id")
                                                    .replace(/_hdr/g, "")}' data-id='${$(
                                                        i
                                                    ).val()}' style='${$(i).closest("td").attr("style")}'>${$(i).attr("readonly")
                                                        ? `<span id>${$(i)
                                                            .find(" option:selected")
                                                            .text()}</span>`
                                                        : `<select id='${$(i).attr("id") + trIdx
                                                        }' is_nullable=${$(i).attr(
                                                            "is_nullable"
                                                        )} style='${$(i).attr("style")}' ${$(i).attr("readonly") ? "readonly" : ""
                                                        }></select>`
                                                    }</td>`;
                                            } else {
                                                if ($(i).attr("id").toLowerCase() == "account_code") {
                                                    html += `<td id='account_oldCode'><span style='color:black;background:#bcd4e0;display:flex;padding: 4px 6px;border-radius: 6px;height:30px;'>${$(
                                                        i
                                                    ).attr("data-code")}</span></td><td class='${$(
                                                        i
                                                    ).attr("data-colname")}' data-type='${$(i).attr(
                                                        "data-type"
                                                    )}' style='${$(i)
                                                        .closest("td")
                                                        .attr("style")}'><input id='${$(i).attr("id") + trIdx
                                                        }' ${typeof $(i).attr("data-id") != "undefined"
                                                            ? `data-id='${$(i).attr("data-id")}'`
                                                            : ""
                                                        } class='${$(i).attr("class")}' ${$(i).attr("data-readonly") == "true"
                                                            ? "readonly"
                                                            : ""
                                                        }  data-colname='${$(i).attr("id")}' style='${$(
                                                            i
                                                        ).attr("style")}' type='${$(i).attr(
                                                            "type"
                                                        )}' is_nullable='${$(i).attr(
                                                            "is_nullable"
                                                        )}' value='${$(i).val()}'></td>`;
                                                } else {
                                                    html += `<td class='${$(i).attr("id") == "account_treeF"
                                                        ? "nodata"
                                                        : $(i).attr("data-colname")
                                                        }' id='${$(i).attr("id") == "account_treeF"
                                                            ? ""
                                                            : $(i).attr("data-colname").toLowerCase()
                                                        }' data-type='${$(i).attr("data-type")}' style='${$(i)
                                                            .closest("td")
                                                            .attr("style")}'><input id='${$(i).attr("id") + trIdx
                                                        }' class='${$(i).attr("class")}' ${typeof $(i).attr("data-id") != "undefined"
                                                            ? `data-id='${$(i).attr("data-id")}'`
                                                            : ""
                                                        } ${$(i).attr("data-readonly") == "true"
                                                            ? "readonly"
                                                            : ""
                                                        }  data-colname='${$(i).attr(
                                                            "data-colname"
                                                        )}' style='${$(i).attr("style")}' type='${$(i).attr(
                                                            "type"
                                                        )}' is_nullable='${$(i).attr(
                                                            "is_nullable"
                                                        )}' value='${$(i).attr("id").toLowerCase() == "id"
                                                            ? uuidv4().replace("-", "")
                                                            : $(i).val()
                                                        }'></td>`;
                                                }
                                            }
                                        });
                                        if ($(`#${c.FKTABLE_NAME}_totalFunction`).length > 0) {
                                            html += `<td class='totalFunction' style='text-align=center;${$(`#${c.FKTABLE_NAME}_totalFunction`).css("display") ==
                                                "none"
                                                ? "display:none; !important;"
                                                : ""
                                                }'></td>`;
                                        }
                                        $(`#${c.FKTABLE_NAME} tbody`).append(html);
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td select`
                                        ).each((idx2, s) => {
                                            let refTb = references_tb.filter(
                                                (r) => r.referenced_mainCol == $(s).attr("id")
                                            )[0];
                                            refTb.referenced_data.forEach((d) => {
                                                $(`#${$(s).attr("id") + trIdx}`).append(
                                                    `<option  value="${d.ID}">${d[refTb.referenced_columns.split(",")[0]]
                                                    }</option>`
                                                );
                                            });

                                            $(`#${$(s).attr("id") + trIdx}`).select2();
                                            $(`#${$(s).attr("id") + trIdx}`).val(
                                                $(`#${$(s).attr("id") + trIdx} option`).filter(
                                                    (idx, option) =>
                                                        $(option).text() ==
                                                        $(`#select2-${$(s).attr("id")}-container`).text()
                                                )[0]?.value
                                            );
                                            $(`#select2-${$(s).attr("id") + trIdx}-container`).text(
                                                $(`#select2-${$(s).attr("id")}-container`).text()
                                            );
                                            $(`#select2-${$(s).attr("id")}-container`).text("اختر");
                                        });

                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td .autocomplete`
                                        ).each((idx2, s) => {
                                            let mainCol =
                                                $(s).attr("id") == "account_treeF"
                                                    ? "account_tree"
                                                    : $(s).attr("data-colname");
                                            let refTb = references_tb?.filter(
                                                (r) => r.referenced_mainCol == mainCol
                                            )[0];
                                            let suggestions = [];
                                            refTb.referenced_data.forEach((d) => {
                                                suggestions.push({
                                                    ID: d["ID"],
                                                    values: refTb.referenced_columns
                                                        .split(",")
                                                        .map((c) => d[c]),
                                                    headers: refTb.referenced_columns
                                                        .split(",")
                                                        .map((c) => c),
                                                });
                                            });
                                            autocomplete($(s).attr("id") + trIdx, suggestions);
                                            if (
                                                $(`#${$(s).attr("id").toLowerCase()}_hdr`).length > 0
                                            ) {
                                                let value =
                                                    $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr(
                                                        "data-id"
                                                    ) == "" ||
                                                        $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr(
                                                            "data-id"
                                                        ) == undefined
                                                        ? $(`#${$(s).attr("id").toLowerCase()}_hdr`).val()
                                                        : $(`#${$(s).attr("id").toLowerCase()}_hdr`).attr(
                                                            "data-id"
                                                        );
                                                let selected = suggestions.filter((s) => s.ID == value);
                                                setTimeout(() => {
                                                    $(s).val(selected[0]?.values[0]);
                                                    $(s).attr("data-id", selected[0]?.ID);
                                                }, 0);
                                            }
                                        });

                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
                                        ).val("");
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
                                        ).attr("data-code", "");
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) input`
                                        ).attr("data-tree", "");
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) #account_treeF`
                                        ).attr("data-id", "");
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) > span`
                                        ).text("");
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) input[type="number"]`
                                        ).val("");
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) #nots`).val(
                                            "-"
                                        );
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) #nots`).attr(
                                            "value",
                                            "-"
                                        );
                                        $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) #sr`).val(
                                            Number(
                                                $('input[data-colname="sr"]:eq(-2)').length > 0
                                                    ? $('input[data-colname="sr"]:eq(-2)').val()
                                                    : 0
                                            ) + 1
                                        );
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) #exchange_rate`
                                        ).val($("#exchange_rate_hdr").val());
                                        $(
                                            `#${c.FKTABLE_NAME} tfoot tr:nth-child(2) td:not([style*="display:none"]) select`
                                        ).val("default");
                                        $(".deleteSubTrNewAdd")
                                            .off("click")
                                            .on("click", (i) => {
                                                if (
                                                    !getCookie("usersgroups")
                                                        .split(",")
                                                        .includes("administrators") &&
                                                    new Date(
                                                        document.getElementById("header_date_hdr").value
                                                    ) < new Date(2023, 6, 30) &&
                                                    window.location.host.toLowerCase() ==
                                                    "elkawmiah.mas.com.eg"
                                                ) {
                                                    swal("ليس لديك صلاحية!");
                                                } else {
                                                    $(i.target).closest("tr").hide();
                                                    $(i.target)
                                                        .closest("tr")
                                                        .find(" td#isdelete input")
                                                        .val("true");
                                                    SubTableFunctionalities(c.FKTABLE_NAME);
                                                    let sumTlt = 0;

                                                    $(
                                                        `#${c.FKTABLE_NAME} tbody tr:not([style*="display: none;"])`
                                                    ).each((idx, tr) => {
                                                        sumTlt += Number($(tr).find(" td:last").text());
                                                    });
                                                    $(`#${c.FKTABLE_NAME}_totalFunction`).text(
                                                        sumTlt.toFixed(2)
                                                    );
                                                    $(`#${c.FKTABLE_NAME} tfoot tr:nth-child(2) #sr`).val(
                                                        Number(
                                                            $('input[data-colname="sr"]:eq(-2)').length > 0
                                                                ? $('input[data-colname="sr"]:eq(-2)').val()
                                                                : 0
                                                        ) + 1
                                                    );
                                                    Math.abs(row.Debit_value - row.Credit_Value) *
                                                        row.Exchange_Rate;
                                                }
                                            });
                                        SubTableFunctionalities(c.FKTABLE_NAME);
                                        subTableInputsChange(c.FKTABLE_NAME);

                                        if ($(`#${c.FKTABLE_NAME}_totalFunction`).length > 0) {
                                            let expression = $(
                                                `#${c.FKTABLE_NAME}_totalFunction`
                                            ).attr("data-totalFunction");
                                            let columnNames = "";
                                            if (expression || expression != undefined) {
                                                columnNames = expression
                                                    .match(/row\.(\w+)/g)
                                                    .map((match) => match.split(".")[1]);
                                            }
                                            let row = {};
                                            $(
                                                `#${c.FKTABLE_NAME} tbody tr:not([style*="display: none;"])`
                                            ).each((idx2, tr) => {
                                                $(tr)
                                                    .find(" td input")
                                                    .each((idx3, i) => {
                                                        let name = $(i).attr("data-colname");
                                                        if (columnNames?.includes(name)) {
                                                            row[name] = $(i).val();
                                                        }
                                                    });

                                                $(tr).find("td:last-child").html(eval(expression));
                                            });
                                            let sumTlt = 0;
                                            $(
                                                `#${c.FKTABLE_NAME} tbody tr:not([style*="display: none;"])`
                                            ).each((idx, tr) => {
                                                sumTlt += Number($(tr).find(" td:last").text());
                                            });
                                            $(`#${c.FKTABLE_NAME}_totalFunction`).text(
                                                sumTlt.toFixed(2)
                                            );
                                        }
                                    } else {
                                        swal(message);
                                    }
                                }
                            }
                        );
                    }
                }
            });
    }

    #appendPopUps() {
        $("body").append(`
      <div id="popup1" class="overlay">
  <div class="popup">
    <a class="close" style="cursor: pointer">×</a>
    <div class="row content1">
      <div class="container">
        <div class="row">
          <div class="col-12">
            <div>
              <div class="form-row" style="justify-content: space-between">
                <div class="form-group col-md-5">
                  <table class="table no-border" id="cust_info">
                    <h1 class="h4">
                      معلومات العميل
                    </h1>
                    <tbody>
                      <tr>
                        <th>أسم العميل</th>
                        <td id="cust_name"></td>
                      </tr>
                      <tr>
                        <th>رقم العميل</th>
                        <td id="cust_number"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="form-group col-md-5">
                  <table class="table no-border" id="cust_info">
                    <h1 class="h4">معلومات السند</h1>
                    <tbody>
                      <tr>
                        <th>قيمة السند</th>
                        <td id="record_value"></td>
                      </tr>
                      <tr>
                        <th>المتاح دفعه من السند</th>
                        <td id="record_discuss"></td>
                      </tr>
                      <tr>
                        <th>اجمالي ما تم سداده</th>
                        <td id="pays_total"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        <section id='installementsModel'>
          <h1>إقساط الوحدات</h1>
          <div id="installementsModelBody"></div>
          <h1 id="unitInstallementsTitle">دفع إقساط</h1>
          <div id="unitInstallementsModel"></div>
          <h1> المدفوعات</h1>
          <div id="unitCashModel"></div>
        </section>
        <div class="row" id="reservModelBody">
          <div class="col-12">
            <div>
              <h4 class="h4">مدفوعات الحجوزات</h4>
              <div class="component">
                <div class="console-card" id="payment_info">
                  <div id="payments_div"></div>
                  <br />
                  <div class="form-row" style="display: none">
                    <div class="form-group col-md-3">
                      <label for="resvation_number" class="label">
                        رقم الحجز
                      </label>
                      <input type="number" id="resvation_number" min="1" disabled class="form-control require input" />
                    </div>
                    <div class="form-group col-md-3">
                      <label for="value" class="label">القيمة </label>
                    </div>
                  </div>
                  <br />
                  <div class="form-row" id="resrvation_samary" style="display: none">
                    <div class="form-group col-md-3">
                      <label for="total" class="label">اجمالي الحجز </label>
                      <input type="text" id="total" min="1" disabled class="form-control require input" style="
                          border: none;
                          background-color: transparent !important;
                        " />
                    </div>
                    <div class="form-group col-md-3">
                      <label for="payment" class="label"> المدفوع </label>
                      <input type="text" id="payment" min="1" disabled class="form-control require input" style="
                          border: none;
                          background-color: transparent !important;
                        " />
                    </div>
                    <div class="form-group col-md-3">
                      <label for="payment_refund" class="label">
                        المردود
                      </label>
                      <input type="text" id="payment_refund" min="1" disabled class="form-control require input" style="
                          border: none;
                          background-color: transparent !important;
                        " />
                    </div>
                    <div class="form-group col-md-3">
                      <label for="remain" class="label"> المتبقي </label>
                      <input type="text" id="remain" min="1" disabled class="form-control require input" style="
                          border: none;
                          background-color: transparent !important;
                        " />
                    </div>
                  </div>
                </div>
              </div>
              <div class="component" style="display: block">
                <div class="console-card">
                  <!-- <div class="form-row">
                                      <div class="form-group col-md-12">
                                        <input
                                          type="text"
                                          id="ou_units_Reservations_finance_advanced_search"
                                          class="input"
                                          placeholder="بحث بمعلومات العميل او رقم الحجز"
                                          autocomplete="off"
                                          data-isevent="1"
                                          style="text-align: center"
                                        />
                                      </div>
                                    </div> -->

                  <div class="form-row" id="invoices"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="popup2" class="overlay">
  <div class="popup">
    <a class="close" style="cursor: pointer">×</a>
    <div class="row content1">
      <div class="container">
        <div class="row">
          <div class="col-12">
            <div>
              <div class="form-row" style="justify-content: space-between">
                <div class="form-group" style='width:100%'>
                    <h1 class="h4">
                      معلومات العميل
                    </h1>
                    <div style='display:flex;align-items:center;justify-content:space-between;'>
                      <h6>اسم العميل: <span id='custName' style='color:#ff9800;'></span></h6>
                     
                      <h6>قيمة الفاتورة: <span id='related_value' style='color:#ff9800;'></span></h6>
                      <h6>المتبقي من الفاتورة: <span id='related_remain' style='color:#ff9800;'></span></h6>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        <div class="row" id="Investors_dataa_payable">
          <div class="col-12">
            <div>
              <h4 class="h4">المستحقات</h4>
              <div class="component">
                <div class="console-card" id="payment_info2">
                  <div id="payments_div table-responsive"></div>
                  <div class="table-responsive">
                    <table id="tbl" class="table table-striped table-hover" style='width:100% !important;'>
                      <thead>
                        <tr>
                          <th scope="col">رقم الفاتورة</th>
                          <th scope="col"> التاريخ</th>
                          <th scope="col"> القيمة المدفوعة  </th> 
                          <th scope="col"> القيمة المردوده  </th> 
                          <th scope="col">  صافي المدفوع  </th> 
                          <th scope="col"> القيمة المتبقية  </th> 
                          <th scope="col"> القيمة الاجمالية  </th> 
                        
                   
                          <th scope="col">  ادخال مبلغ </th> 
                          <th scope="col"> ملاحظه </th> 
                          
                          
                        </tr>
                      </thead>
                      <tbody id="tbod">

                      </tbody>
                    </table>
                  </div>
                  <br />
                </div>
              </div>
            </div>
          </div>
        </div>



        <div class="row" id="reservModelBody">
          <div class="col-6">
            <div >
              <h4 class="h4">الدفعات</h4>
              <div class="component">
                <div class="table-responsive">
                  <table id="tbl1" class="table  table-striped table-hover" style="text-align: center;">
                    <thead>
                      <tr>
                        <th scope="col">رقم الفاتورة</th>
                        <th scope="col">تاريخ الحركة</th>
                  
                        <th scope="col">قيمة الدفع </th>
                  
                      </tr>
                    </thead>
                    <tbody id="tbod1">

                    </tbody>
                  </table>
                  <br />
                </div>
              </div>
            </div>
          </div>
          <div class="col-6">
            <div>
              <h4 class="h4">المصروفات</h4>
              <div class="component">
                <div class="table-responsive">
                  <table id="tbl1" class="table  table-striped table-hover" style="text-align: center;">
                    <thead>
                      <tr>
                        <th scope="col">رقم الفاتورة</th>
                        <th scope="col">تاريخ الحركة</th>
                       
                        <th scope="col">قيمة المصروف </th>
                  
                      </tr>
                    </thead>
                    <tbody id="tbod2">
      
                    </tbody>
                  </table>
                  <br />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

`);
        $("#popup1 .close")
            .off("click")
            .on("click", function () {
                $("#popup1").css("visibility", "hidden");
                $("#popup1").css("opacity", "0");
                $("#popup1 #total").val(0);
                $("#popup1 #payment").val(0);
                $("#popup1 #payment_refund").val(0);
                $("#popup1 #remain").val(0);
                $("#popup1 #resvation_number").val("");
                $("#popup1 #resvation_number").removeAttr("data-id");
                $("#popup1 #value").val("");
                $("#payments_table").remove();
                $("#invoice_table").remove();
            });
        $("#popup2 .close")
            .off("click")
            .on("click", function () {
                $("#popup2").css("visibility", "hidden");
                $("#popup2").css("opacity", "0");
                $("#popup2 #nam").val("");
                $("#popup2 #chasis").val("");
                $("#popup2 #contractValue").val("");
                $("#popup2 #contractDate").val("");
                $("#popup2 #record_value").val("");
                $("#popup2 #value").val("");
                $("#popup2 #record_discuss").val("");
                $("#popup2 #pays_total").val("");
                $("#popup2 #tbod0").html("");
                $("#popup2 #tbod1").html("");
            });
    }

    #appendEditPage(type, table) {
        let _repo = this;
        if ($("#" + this.elementID + " > #editPage").length == 0) {
            $("#" + this.elementID).append('<div id="editPage"></div>');
        }
        $("#" + this.elementID + " > #editPage").html(" ");
        $("#" + this.elementID + " > #editPage").append(`


<div class="modal fade" id="editDocumentPage" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1"
  aria-labelledby="staticBackdropLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content secondPagee">
      <div class="modal-header">
        <h4 class='mtitle settingTitle' style='text-align: center;inset-inline-start: 30px;'>
        </h4>
        <span class='btn btn-outline-danger' data-bs-dismiss="modal" aria-label="Close">x</span>
      </div>
      <div class="modal-body">
        <div id="chooseTable" style='text-align:end;'>
          <label for="chooseTableInpt" id="chooseTableLbl">:
          </label>
          <select id="chooseTableInpt">
          </select>

           <div id='chooseTableInpt_ment' class='stBtns' style='margin:10px 0;'>
          <button class=' chooseTableInpt_ment btn btn-outline-white' data-obname='structure_tables' >structure_tables</button>
          <button class=' chooseTableInpt_ment btn btn-outline-white' data-obname='structure_columns' >structure_columns</button>
            <button class='chooseTableInpt_ment btn btn-outline-white' data-obname='structure_tables_children' >structure_tables_children</button>

          </div>
          <div class="stBtns d-flex justify-content-end align-items-center gap-3 mt-2">
            <button id="buildSt" class="btn btn-outline-white">
            </button>
            <button id="ResetSt" class="btn btn-outline-white">
            </button>
          </div>
        </div>
        <form name="editSave" id="editSave">
          <div class="d-flex gap-2 mb-2">
            <label for="systemEdit" id="systemeditlbl">
            </label>
            <input type="radio" value="master" name="editSave">
          </div>
          <div class="d-flex gap-2 mb-2">
            <label for="companyEdit" id="companyEditlbl">
            </label>
            <input type="radio" value="company" id="companyEdit" name="editSave" checked>
          </div>
        </form>
        <div class="d-flex align-items-center w-50 gap-3">
          <div class="inputgroup col-6 d-flex align-items-center gap-2 mb-3">
            <label for="docTitle_inpt" id="docTitle_lbl" style="color:#ff9800 !important;">:
            </label>
            <input id="docTitle_inpt" type="text" style="max-width:250px !important;">
          </div>
        </div>
        <ul class="d-flex justify-content-center align-items-center gap-3 mt-4 tabBtnsGroup"
          style="margin-bottom: -16px;">
          <li id="showColumnsEdit" class="btn btn-outline-info tabBtn active" data-name="columns">
          </li>
          <li id="showTablesEdit" class="btn btn-outline-info tabBtn" data-name="tables">
          </li>
        </ul>
        <div style='overflow:scroll;'>
          <table id="inputsContainer"
            class="table table-borderless table-striped tabledatacss table-earning inputsContainer_table">
            <thead id="header_TablesContainer">
            </thead>
            <thead id="header_ColumnsContainer">
            </thead>
            <tbody id="body_ColumnsContainer">
            </tbody>
            <tbody id="body_TablesContainer">
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        <button id='saveDocument'
          onclick="save_editDoc($('#chooseTableInpt option:selected').html(),$('.tabBtnsGroup li.active').attr('data-name'))"
          class='btn btn-success'>
        </button>
      </div>
    </div>
  </div>
</div>
     `);

        $(".chooseTableInpt_ment")
            .off("click")
            .on("click", function () {
                let obname = $(this).data("obname");
                let tbname = document.getElementById("chooseTableInpt").value;
                let cond = "";

                if (obname == "structure_tables") {
                    cond = " table_name ='" + tbname + "'";
                } else if (obname == "structure_columns") {
                    cond = " object_name ='" + tbname + "'";
                } else if (obname == "structure_tables_children") {
                    cond = " pktable_name ='" + tbname + "'";
                }
                if ($("#companyEdit")[0].checked) {
                    obname += "_company";
                }
                let url =
                    "../../erp2/index?id=da25e35bd64e4840a139dff4306adaa1&tbh=" +
                    obname +
                    "&cond=" +
                    cond;
                window.open(url, "_blank");
            });

        $(".settingTitle").text(
            getCookie("UserLang") == "ar" ? "الإعدادات" : "Settings"
        );
        $("#chooseTableLbl").text(
            getCookie("UserLang") == "ar" ? "الجدول" : "Table"
        );
        $("#buildSt").text(getCookie("UserLang") == "ar" ? "بناء" : "Build");
        $("#buildSt")
            .off("click")
            .on("click", () => {
                loading("building");
                $.post(
                    "../../erp/proced",
                    {
                        id:
                            "structure_build '" +
                            $("#chooseTableInpt option:selected").html() +
                            "','" +
                            getCookie("CompId") +
                            "'",
                    },
                    function (data) {
                        unloading("building");
                        swal("تم");
                    }
                );
            });
        $("#ResetSt").append(getCookie("UserLang") == "ar" ? "إعادة ضبط" : "Reset");
        $("#ResetSt")
            .off("click")
            .on("click", () => {
                loading("reseting");
            });
        $("#systemeditlbl ").text(
            getCookie("UserLang") == "ar" ? "تعديل رئيسي" : "Master Edit"
        );
        $("#companyEditlbl").text(
            getCookie("UserLang") == "ar" ? "تعديل للشركة" : "Company Edit"
        );
        $("#showColumnsEdit").text(
            getCookie("UserLang") == "ar" ? "الأعمدة" : "Columns"
        );
        $("#docTitle_lbl").text(
            getCookie("UserLang") == "ar" ? "العنوان" : "Title"
        );
        $("#showTablesEdit").text(
            getCookie("UserLang") == "ar" ? "الجداول" : "Tables"
        );
        $("#header_TablesContainer").append(
            getCookie("UserLang") == "ar"
                ? `
              <tr class="maincol">
                <th data-name="id">#</th>
                <th data-name="sort">الترتيب</th>
                <th data-name="is_show">اظهار</th>
              </tr>`
                : `<tr class="maincol">
                <th data-name="id">#</th>
                <th data-name="sort">Sort</th>
                <th data-name="is_show">Show</th>
              </tr>`
        );
        $("#header_ColumnsContainer").append(
            getCookie("UserLang") == "ar"
                ? `
              <tr class="maincol">
                <th data-name="id">#</th>
                <th data-name="sort">الترتيب</th>
                <th data-name="name">الاسم</th>
                <th data-name="is_show">اظهار</th>
                <th data-name="readonly">قرائه فقط</th>
                <th data-name="column_width">عرض العنصر</th>
                <th data-name="function_name">وظيفة العمود</th>
                <th data-name="referenced_table">طريقة الإدخال</th>
              </tr>`
                : `<tr class="maincol">
                <th data-name="id">#</th>
                <th data-name="sort">Sort</th>
                <th data-name="name">Name</th>
                <th data-name="is_show">Show</th>
                <th data-name="readonly">Readonly</th>
                <th data-name="column_width">Element Width</th>
                <th data-name="function_name">Function Name</th>
                <th data-name="referenced_table">Reference Input Type</th>
              </tr>`
        );
        $("#saveDocument").append(getCookie("UserLang") == "ar" ? "حفظ" : "Save");

        //type =master or company
        let id =
            "structure_info_" +
            type +
            " '" +
            table +
            "','" +
            getCookie("CompId") +
            "'";

        if (type == "master") {
            $("#tablesPage").show();

            id = "structure_info_" + type + " '" + table + "'";
        }
        $.post("../../erp/procedq", { id: id }, function (data) {
            if (data.length > 0) {
                if (JSON.parse(data[0].columns_info) != null) {
                    let object_info = JSON.parse(data[0].object_info)[0];
                    let columns_info = JSON.parse(data[0].columns_info);
                    let tables_info = JSON.parse(data[0].children_info);
                    columns_info.sort((a, b) => a.sort - b.sort);
                    tables_info?.sort((a, b) => a.sort - b.sort);
                    $("#chooseTableInpt").html("");
                    $("#chooseTableInpt").append(
                        `<option value='${table}'>${table}</option>
            ${table.toLowerCase() != getpar("tbh").toLowerCase()
                            ? `<option value='${getpar("tbh")}'>${getpar("tbh")}</option>`
                            : ""
                        }`
                    );
                    tables_info?.map((t) => {
                        $("#chooseTableInpt").append(
                            `<option column='${t.FKCOLUMN_NAME}' value='${t.FKTABLE_NAME}'>${t.FKTABLE_NAME}</option>`
                        );
                    });

                    columns_info = columns_info.filter(
                        (c) =>
                            ![
                                "company_id",
                                "begin_date",
                                "branch_id",
                                "id",
                                "last_update",
                            ].includes(c.en_name?.toLowerCase())
                    );

                    $("#docTitle_inpt").val(
                        getCookie("UserLang") == "ar"
                            ? object_info?.ar_name
                            : object_info?.en_name
                    );
                    $("#docTitle_inpt").attr("data-tableName", object_info?.table_name);
                    $("#body_ColumnsContainer").html("");
                    $("#body_TablesContainer").html("");
                    columns_info.map((c) => {
                        $("#body_ColumnsContainer").append(`
            <tr id = ${c.ID} >
                  <td class='tdid'>${c.name}</td>
                  <td class='tdsort'><input id="${c.ID
                            }_sort" type="number" value=${c.sort}></td>
                  <td class='tdname'><input id='${c.ID
                            }_name' class='inpt' type='text' value='${getCookie("UserLang") == "ar" ? c.ar_name : c.en_name
                            }' /></td>
                  <td class='tdishow'><input id='${c.ID
                            }_show' type='checkbox' ${c.is_show ? "checked" : ""}/></td>
                  <td class='tdreadonly'><input id='${c.ID
                            }_readonly' type='checkbox' ${c.readonly ? "checked" : ""
                            }></td>
 <td class='tdwidth'><input id='${c.ID}_width' type='number' value=${c.column_width
                            }></td>
                  ${c.html_element_type == "number" || c.function_name
                                ? `  <td class='tdfunction_name'><select name='${c.ID
                                }_function_name' id='${c.ID}_function_name'>
                    <option value=''>${getCookie("UserLang") == "en" ? "Choose" : "اختر"
                                }</option>
                    <option value='sum'>${getCookie("UserLang") == "en" ? "Sum" : "إجمالي"
                                }</option>
                    <option value='avg'>${getCookie("UserLang") == "en" ? "Average" : "متوسط"
                                }</option>
                    </select>
                    </td>`
                                : "<td class='tdfunction_name'></td>"
                            }
                  ${c.referenced_table
                                ? `
                      <td class='tdreference'>
                        <select name='${c.ID}_reference' id='${c.ID}_reference'>
                          <option value='search_input' selected>${getCookie("UserLang") == "en"
                                    ? "Search Input"
                                    : "بحث"
                                }</option>
                          <option value='select'>${getCookie("UserLang") == "en"
                                    ? "Select Input"
                                    : "اختيارات"
                                }</option>
                          <option value='autocomplete'>${getCookie("UserLang") == "en"
                                    ? "Auto Complete"
                                    : "تكملة تلقائية"
                                }</option>
                        </select>
                      </td>
                    `
                                : '<td class="tdreference"></td>'
                            }
                </tr >
            `);
                        $(`#${c.ID}_reference`).val(c.referenced_table_search);
                        $(`#${c.ID}_function_name`).val(c.function_name);
                    });
                    _repo.children?.map((c) => {
                        $("#body_TablesContainer").append(`
            <tr id=${c.ID} data-table='${c.FKTABLE_NAME}' class='trTableInfo' >
                  <td class='tdid'>${c.FKTABLE_NAME}</td>
                  <td class='tdsort'><input id="${c.ID
                            }_sort" type="number" value=${c.sort}></td>
                  <td class='tdishow'><input id='${c.ID
                            }_show' type='checkbox' ${c.is_show ? "checked" : ""}/></td>
                </tr >
            `);
                    });
                    $("#header_TablesContainer").hide();
                    $("#body_TablesContainer").hide();
                } else {
                    // $.post(
                    //   "../../erp/procedq",
                    //   {
                    //     id:
                    //       "structure_build '" + table + "','" + getCookie("CompId") + "'",
                    //   },
                    //   function (data) {
                    //     // #appendEditPage(type, table);
                    //   }
                    // );
                    // return;
                }
            }
        });
        $("#editDocumentPage").hide();
    }
}
